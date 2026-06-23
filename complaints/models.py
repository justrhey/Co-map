from django.db import models
from django.conf import settings
from django.core.validators import FileExtensionValidator


class Complaint(models.Model):
    """A community-submitted complaint pinned to a geographic location."""

    class Category(models.TextChoices):
        POTHOLES = 'potholes', 'Potholes / Road Damage'
        STREETLIGHT = 'streetlight', 'Broken Streetlight'
        GRAFFITI = 'graffiti', 'Graffiti / Vandalism'
        ILLEGAL_DUMPING = 'illegal_dumping', 'Illegal Dumping'
        SIDEWALK = 'sidewalk', 'Damaged Sidewalk'
        TRAFFIC = 'traffic', 'Traffic Sign / Signal Issue'
        NOISE = 'noise', 'Noise Complaint'
        PARK = 'park', 'Park / Public Space Issue'
        WATER = 'water', 'Water / Drainage Issue'
        OTHER = 'other', 'Other'

    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        APPROVED = 'approved', 'Approved'
        RESOLVED = 'resolved', 'Resolved'

    latitude = models.FloatField(help_text="Latitude of the complaint location")
    longitude = models.FloatField(help_text="Longitude of the complaint location")
    description = models.TextField(
        blank=True,
        help_text="Description of the issue (Situation)"
    )
    impact = models.TextField(
        blank=True, default='',
        help_text="How does this issue affect you or the community?"
    )
    action_requested = models.TextField(
        blank=True, default='',
        help_text="What action would you like to be taken?"
    )
    category = models.CharField(
        max_length=30,
        choices=Category.choices,
        default=Category.OTHER,
        db_index=True,
    )
    custom_category = models.CharField(
        max_length=100,
        blank=True,
        default='',
        help_text="User-defined category name when category is 'other'",
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
        db_index=True,
    )
    photo = models.ImageField(
        upload_to='complaint_photos/',
        help_text="Photo of the issue (required)"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='complaints',
        help_text="User who submitted this complaint"
    )
    ip_address = models.GenericIPAddressField(
        blank=True, null=True,
        help_text="Submitter's IP (for rate limiting / abuse tracking)"
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)
    acknowledged_at = models.DateTimeField(null=True, blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolution_photo = models.ImageField(upload_to='resolution_photos/', blank=True)
    official_notes = models.TextField(blank=True, default='')

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status', '-created_at']),
            models.Index(fields=['latitude', 'longitude']),
        ]

    def __str__(self):
        return f"[{self.get_status_display()}] {self.get_category_display()} @ ({self.latitude}, {self.longitude})"


class ReportMedia(models.Model):
    """Multiple media attachments per complaint (images, video, audio)."""
    MEDIA_TYPES = [
        ('image', 'Image'),
        ('video', 'Video'),
        ('audio', 'Audio'),
    ]

    complaint = models.ForeignKey(
        Complaint, related_name='media', on_delete=models.CASCADE
    )
    file = models.FileField(
        upload_to='report_media/',
        validators=[FileExtensionValidator(
            allowed_extensions=['jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4', 'webm', 'mov', 'mp3', 'wav', 'ogg', 'm4a']
        )],
    )
    media_type = models.CharField(max_length=10, choices=MEDIA_TYPES)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"[{self.media_type}] Media for Complaint #{self.complaint_id}"


class ReportScore(models.Model):
    """Quality score for a complaint report — computed on submission."""
    complaint = models.OneToOneField(
        Complaint, related_name='score', on_delete=models.CASCADE
    )
    total = models.IntegerField(default=0, help_text="Overall score 0-100")
    letter_grade = models.CharField(max_length=1, default='F')

    # Dimension breakdowns
    specificity = models.IntegerField(default=0, help_text="Locations, measurements, landmarks (0-30)")
    context = models.IntegerField(default=0, help_text="Time, frequency, affected people (0-25)")
    clarity = models.IntegerField(default=0, help_text="Well-structured description (0-20)")
    completeness = models.IntegerField(default=0, help_text="Photo, impact, action requested (0-15)")
    actionability = models.IntegerField(default=0, help_text="Suggested action (0-10)")

    description_detail = models.TextField(
        blank=True, default='',
        help_text="Analysis notes explaining the score breakdown"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Score {self.total} ({self.letter_grade}) for Complaint #{self.complaint_id}"


class Vote(models.Model):
    """An upvote on a complaint by a user. One vote per user per complaint."""
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='votes',
    )
    complaint = models.ForeignKey(
        Complaint,
        on_delete=models.CASCADE,
        related_name='votes',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'complaint'],
                name='unique_user_complaint_vote',
            ),
        ]
        ordering = ['-created_at']

    def __str__(self):
        return f"Vote by {self.user_id} on complaint#{self.complaint_id}"
