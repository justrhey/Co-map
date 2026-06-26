from rest_framework import serializers
from django.core.validators import FileExtensionValidator
from .models import Complaint, ReportMedia, ReportScore, Comment
from .profanity import contains_profanity

MAX_COMMENT_LEN = 1000

PROFANITY_MSG = 'Please keep it respectful — remove offensive language and try again.'


def reject_profanity(value, field_label='text'):
    """Raise a ValidationError if the value contains blocked language."""
    if value and contains_profanity(value):
        raise serializers.ValidationError(PROFANITY_MSG)
    return value

# Metro Manila bounding box
MM_LAT_MIN, MM_LAT_MAX = 14.25, 14.85
MM_LNG_MIN, MM_LNG_MAX = 120.85, 121.20

MAX_PHOTO_SIZE = 5 * 1024 * 1024  # 5 MB
MAX_VIDEO_SIZE = 50 * 1024 * 1024  # 50 MB
MAX_AUDIO_SIZE = 20 * 1024 * 1024  # 20 MB

MAX_MEDIA_FILES = 10  # max additional attachments per complaint

ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime']
ALLOWED_AUDIO_TYPES = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/x-m4a']


def validate_media_file(file):
    """Validate a single media file based on its type."""
    if file.size == 0:
        raise serializers.ValidationError('File is empty.')

    ct = file.content_type or ''

    if ct in ALLOWED_IMAGE_TYPES:
        if file.size > MAX_PHOTO_SIZE:
            raise serializers.ValidationError(f'Image too large ({file.size // 1024} KB). Max {MAX_PHOTO_SIZE // 1024 // 1024} MB.')
        return 'image'
    elif ct in ALLOWED_VIDEO_TYPES:
        if file.size > MAX_VIDEO_SIZE:
            raise serializers.ValidationError(f'Video too large ({file.size // 1024 // 1024} MB). Max {MAX_VIDEO_SIZE // 1024 // 1024} MB.')
        return 'video'
    elif ct in ALLOWED_AUDIO_TYPES:
        if file.size > MAX_AUDIO_SIZE:
            raise serializers.ValidationError(f'Audio too large ({file.size // 1024 // 1024} MB). Max {MAX_AUDIO_SIZE // 1024 // 1024} MB.')
        return 'audio'
    else:
        raise serializers.ValidationError(f'Unsupported file type "{ct}". Use images (JPEG, PNG, WebP), video (MP4), or audio (MP3, WAV).')


class ReportMediaSerializer(serializers.ModelSerializer):
    file = serializers.SerializerMethodField()

    def get_file(self, obj):
        return _relative_media_url(obj.file)

    class Meta:
        model = ReportMedia
        fields = ['id', 'file', 'media_type', 'uploaded_at']
        read_only_fields = ['id', 'uploaded_at']


class ReportScoreSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReportScore
        fields = [
            'total', 'letter_grade', 'specificity', 'context',
            'clarity', 'completeness', 'actionability', 'description_detail',
        ]


def _relative_media_url(file_field):
    """Return a root-relative /media/... URL so images load through whatever
    origin served the SPA (Vite proxy in dev, same domain in prod). Avoids the
    hardcoded http://localhost:8000 that breaks on 127.0.0.1 / LAN IPs."""
    if not file_field:
        return None
    try:
        return file_field.url
    except ValueError:
        return None


class ComplaintListSerializer(serializers.ModelSerializer):
    """Compact serializer for list views — excludes full description to save bandwidth."""
    category_display = serializers.CharField(source='get_category_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    score_grade = serializers.SerializerMethodField()
    user = serializers.SerializerMethodField()
    vote_count = serializers.SerializerMethodField()
    user_vote = serializers.SerializerMethodField()
    photo = serializers.SerializerMethodField()

    def get_photo(self, obj):
        return _relative_media_url(obj.photo)

    class Meta:
        model = Complaint
        fields = [
            'id', 'latitude', 'longitude', 'category', 'category_display',
            'status', 'status_display', 'custom_category', 'photo', 'created_at',
            'score_grade', 'user', 'vote_count', 'user_vote',
        ]

    def get_user(self, obj):
        if obj.user:
            # Public list — expose only a display name, never the email (PII).
            return {
                'id': obj.user.id,
                'name': obj.user.first_name or obj.user.email.split('@')[0],
            }
        return None

    def get_score_grade(self, obj):
        try:
            return obj.score.letter_grade if hasattr(obj, 'score') and obj.score else None
        except ReportScore.DoesNotExist:
            return None

    def get_vote_count(self, obj):
        return getattr(obj, '_vote_count', obj.votes.count())

    def get_user_vote(self, obj):
        if not self.context.get('request') or not self.context['request'].user.is_authenticated:
            return False
        return getattr(obj, '_user_vote', obj.votes.filter(user=self.context['request'].user).exists())


class ComplaintDetailSerializer(serializers.ModelSerializer):
    """Full serializer for single-complaint detail view."""
    category_display = serializers.CharField(source='get_category_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    media = ReportMediaSerializer(many=True, read_only=True)
    score = ReportScoreSerializer(read_only=True)
    vote_count = serializers.SerializerMethodField()
    user_vote = serializers.SerializerMethodField()
    photo = serializers.SerializerMethodField()

    def get_photo(self, obj):
        return _relative_media_url(obj.photo)

    class Meta:
        model = Complaint
        fields = [
            'id', 'latitude', 'longitude', 'description', 'category',
            'category_display', 'status', 'status_display', 'photo',
            'impact', 'action_requested', 'media', 'score',
            'created_at', 'updated_at',
            'acknowledged_at', 'resolved_at', 'resolution_photo', 'official_notes',
            'vote_count', 'user_vote', 'discussion_enabled', 'comment_count',
        ]
        # `status` is writable so an owner can update their own report's status
        # (timestamps are set in the viewset's perform_update). The `photo`
        # SerializerMethodField is inherently read-only. Moderation-only fields
        # stay read-only here.
        read_only_fields = ['id', 'created_at', 'updated_at',
                            'acknowledged_at', 'resolved_at', 'resolution_photo', 'official_notes']

    comment_count = serializers.SerializerMethodField()

    def get_comment_count(self, obj):
        return obj.comments.filter(hidden=False).count()

    def get_vote_count(self, obj):
        return getattr(obj, '_vote_count', obj.votes.count())

    def get_user_vote(self, obj):
        if not self.context.get('request') or not self.context['request'].user.is_authenticated:
            return False
        return getattr(obj, '_user_vote', obj.votes.filter(user=self.context['request'].user).exists())


class ComplaintCreateSerializer(serializers.ModelSerializer):
    """Write-only serializer for creating complaints with multi-media support."""
    additional_media = serializers.ListField(
        child=serializers.FileField(),
        required=False,
        write_only=True,
    )

    class Meta:
        model = Complaint
        fields = [
            'latitude', 'longitude', 'description', 'category', 'photo',
            'custom_category', 'impact', 'action_requested', 'additional_media',
            'discussion_enabled',
        ]

    def validate_description(self, value):
        return reject_profanity(value, 'description')

    def validate_impact(self, value):
        return reject_profanity(value, 'impact')

    def validate_action_requested(self, value):
        return reject_profanity(value, 'action')

    def validate_custom_category(self, value):
        return reject_profanity(value, 'title')

    def validate_latitude(self, value):
        if not (MM_LAT_MIN <= value <= MM_LAT_MAX):
            raise serializers.ValidationError(f'Latitude must be between {MM_LAT_MIN} and {MM_LAT_MAX} (Metro Manila).')
        return value

    def validate_longitude(self, value):
        if not (MM_LNG_MIN <= value <= MM_LNG_MAX):
            raise serializers.ValidationError(f'Longitude must be between {MM_LNG_MIN} and {MM_LNG_MAX} (Metro Manila).')
        return value

    def validate_photo(self, file):
        if not file:
            raise serializers.ValidationError('A photo is required.')
        if file.size > MAX_PHOTO_SIZE:
            raise serializers.ValidationError(f'Photo too large ({file.size // 1024} KB). Max {MAX_PHOTO_SIZE // 1024 // 1024} MB.')
        allowed_types = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
        if file.content_type not in allowed_types:
            raise serializers.ValidationError(f'Unsupported file type "{file.content_type}". Use JPEG, PNG, or WebP.')
        return file

    def validate_additional_media(self, files):
        if not files:
            return files
        if len(files) > MAX_MEDIA_FILES:
            raise serializers.ValidationError(
                f'Too many files ({len(files)}). Attach at most {MAX_MEDIA_FILES}.'
            )
        for f in files:
            validate_media_file(f)
        return files

    def validate(self, data):
        """Validate complaint category against location terrain."""
        from .terrain import validate_complaint_terrain

        category = data.get('category')
        lat = data.get('latitude')
        lng = data.get('longitude')

        if category and lat is not None and lng is not None:
            is_valid, message = validate_complaint_terrain(category, lat, lng)
            if not is_valid:
                raise serializers.ValidationError({'location': message})

        return data

    def create(self, validated_data):
        additional_files = validated_data.pop('additional_media', [])
        complaint = Complaint.objects.create(**validated_data)

        # Create media entries for additional files
        for f in additional_files:
            media_type = validate_media_file(f)
            ReportMedia.objects.create(
                complaint=complaint,
                file=f,
                media_type=media_type,
            )

        return complaint


class ComplaintStatusUpdateSerializer(serializers.Serializer):
    """Serializer for updating complaint status with optional notes and photo."""
    status = serializers.ChoiceField(choices=Complaint.Status.choices)
    official_notes = serializers.CharField(required=False, allow_blank=True)
    resolution_photo = serializers.ImageField(required=False)

    def validate(self, data):
        if data.get('status') == 'resolved' and not data.get('resolution_photo'):
            raise serializers.ValidationError({'resolution_photo': 'A resolution photo is required when status is resolved.'})
        return data


class CommentSerializer(serializers.ModelSerializer):
    """A discussion-thread comment. Reads expose only a display name (no PII)."""
    user = serializers.SerializerMethodField()
    is_reporter = serializers.SerializerMethodField()
    replies = serializers.SerializerMethodField()

    class Meta:
        model = Comment
        fields = ['id', 'body', 'user', 'is_reporter', 'parent', 'replies', 'created_at']
        read_only_fields = ['id', 'user', 'is_reporter', 'replies', 'created_at']

    def get_user(self, obj):
        if obj.user:
            return {'id': obj.user.id, 'name': obj.user.first_name or obj.user.email.split('@')[0]}
        return None

    def get_is_reporter(self, obj):
        return bool(obj.user_id and obj.complaint.user_id == obj.user_id)

    def get_replies(self, obj):
        # Only serialize replies for top-level comments (one level deep).
        if obj.parent_id is not None:
            return []
        kids = obj.replies.filter(hidden=False).select_related('user')
        return CommentSerializer(kids, many=True, context=self.context).data

    def validate_body(self, value):
        text = (value or '').strip()
        if not text:
            raise serializers.ValidationError('Comment cannot be empty.')
        if len(text) > MAX_COMMENT_LEN:
            raise serializers.ValidationError(f'Comment too long (max {MAX_COMMENT_LEN} characters).')
        reject_profanity(text, 'comment')
        return text
