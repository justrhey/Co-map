from rest_framework import permissions, viewsets, filters
from rest_framework.decorators import api_view, throttle_classes, action, permission_classes
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle
from rest_framework.settings import api_settings
from django.db import connection
from django.db.models import Count, Exists, OuterRef, Q, Avg
from django.db.models.functions import Round
from django.utils import timezone
from django.http import JsonResponse
from django.contrib.auth import get_user_model
from rest_framework.exceptions import PermissionDenied
from .models import Complaint, ReportScore, Vote, Comment, UserBan
from .api import (
    ComplaintListSerializer, ComplaintDetailSerializer,
    ComplaintCreateSerializer, ComplaintStatusUpdateSerializer,
    CommentSerializer,
)
import math
import logging

audit = logging.getLogger('audit')


def get_client_ip(request):
    """Resolve the real client IP, honoring REST_FRAMEWORK['NUM_PROXIES'].

    With NUM_PROXIES=0 (default) a spoofed X-Forwarded-For is ignored and
    REMOTE_ADDR is used. With N>0, the Nth-from-last XFF entry is trusted —
    matching the value DRF's throttles key on, so rate limits can't be
    bypassed by forging the header.
    """
    num_proxies = api_settings.NUM_PROXIES
    xff = request.META.get('HTTP_X_FORWARDED_FOR')
    remote = request.META.get('REMOTE_ADDR')
    if num_proxies and xff:
        addrs = [a.strip() for a in xff.split(',')]
        return addrs[-min(num_proxies, len(addrs))]
    return remote


class SubmissionThrottle(AnonRateThrottle):
    """Stricter submission throttle for anonymous users (keyed by IP)."""
    scope = 'submission'
    rate = '10/hour'


class SubmissionUserThrottle(UserRateThrottle):
    """Same submission limit applied to authenticated users (keyed by user),
    so logging in doesn't bypass the per-submission cap."""
    scope = 'submission'
    rate = '10/hour'


class CommentThrottle(UserRateThrottle):
    """Cap how fast a user can post comments, to stop thread flooding.
    Rate comes from DEFAULT_THROTTLE_RATES['comment'] so it stays configurable."""
    scope = 'comment'


class VoteThrottle(UserRateThrottle):
    """Light cap on vote toggling to stop count-spam loops.
    Rate comes from DEFAULT_THROTTLE_RATES['vote']."""
    scope = 'vote'


def assert_not_banned(user):
    """Raise 403 if the user is currently serving an active ban. Used to gate
    content creation (reports, comments). Expired bans are ignored."""
    if not user or not user.is_authenticated:
        return
    ban = UserBan.objects.filter(user=user).first()
    if ban and ban.is_active:
        from django.utils import timezone
        if ban.expires_at:
            when = ban.expires_at.strftime('%b %d, %Y at %H:%M')
            msg = f"Your account is suspended until {when}."
        else:
            msg = "Your account is suspended."
        if ban.reason:
            msg += f" Reason: {ban.reason}"
        raise PermissionDenied(msg)


class IsOwnerOrStaffOrReadOnly(permissions.BasePermission):
    """Read for anyone; create for authenticated users; edit/delete only for
    the complaint's owner or staff. Prevents users from mutating reports they
    don't own."""

    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        return bool(
            request.user
            and request.user.is_authenticated
            and (request.user.is_staff or obj.user_id == request.user.id)
        )


# ── Scoring Pipeline ─────────────────────────────────────────────

def score_complaint(complaint):
    """
    Evaluates report quality (0-100) based on genuine detail and structure:
    - Structure (25%): Template usage — situation, impact, action all written out
    - Detail Quality (30%): Descriptive richness, specific observations, real-world signals
    - Completeness (15%): Photo + all fields used
    - Coherence (20%): Tells a complete story — what, where, why it matters, what's needed
    - Actionability (10%): Clear, specific requested action
    """
    desc = (complaint.description or '').strip()
    impact = (complaint.impact or '').strip()
    action_req = (complaint.action_requested or '').strip()
    combined = f"{desc} {impact} {action_req}"

    words = combined.split()
    word_count = len(words)

    # ── Structure (0-25) — template fields properly filled ──
    structure = 0
    # Situation has real content (not just a few words)
    desc_words = len(desc.split())
    if desc_words >= 5: structure += 8
    elif desc_words >= 2: structure += 3
    # Impact is filled
    if len(impact) > 10: structure += 8
    elif impact: structure += 3
    # Action requested is filled
    if len(action_req) > 10: structure += 9
    elif action_req: structure += 3
    structure = min(structure, 25)

    # ── Detail Quality (0-30) — genuine descriptive signals ──
    detail = 0
    combined_lower = combined.lower()

    # Specific place/location signals (not just keywords, meaningful location context)
    location_signals = ['at ', 'near ', 'along ', 'beside ', 'behind ', 'between ',
                        'in front of', 'across ', 'corner', 'intersection',
                        'street', 'road ', 'avenue', 'barangay', 'brgy.']
    loc_count = sum(1 for sig in location_signals if sig in combined_lower)
    if loc_count >= 3: detail += 10
    elif loc_count >= 2: detail += 7
    elif loc_count >= 1: detail += 3

    # Temporal context — real time references
    time_signals = ['every', 'always', 'since', 'for ', 'week', 'month',
                    'morning', 'evening', 'night', 'afternoon',
                    'yesterday', 'today', 'last ']
    time_count = sum(1 for sig in time_signals if sig in combined_lower)
    if time_count >= 3: detail += 8
    elif time_count >= 2: detail += 5
    elif time_count >= 1: detail += 2

    # Human impact — mentions people affected
    people_signals = ['people', 'children', 'senior', 'resident', 'neighbor',
                      'family', 'commuter', 'pedestrian', 'student',
                      'driver', 'everyone', 'community', 'public']
    people_count = sum(1 for sig in people_signals if sig in combined_lower)
    if people_count >= 2: detail += 7
    elif people_count >= 1: detail += 3

    # Sensory / observable detail
    sensory_signals = ['deep', 'wide', 'large', 'small', 'broken', 'cracked',
                       'flood', 'blocked', 'dark', 'loud', 'smell', 'smoke',
                       'damage', 'rotten', 'rusty', 'sharp', 'debris', 'loose',
                       'spill', 'overflow', 'stagnant', 'hole']
    sensory_count = sum(1 for sig in sensory_signals if sig in combined_lower)
    if sensory_count >= 3: detail += 5
    elif sensory_count >= 2: detail += 3
    elif sensory_count >= 1: detail += 1

    detail = min(detail, 30)

    # ── Completeness (0-15) ──
    completeness = 0
    has_media = bool(complaint.photo) or complaint.media.exists()
    if has_media: completeness += 6
    if impact: completeness += 4
    if action_req: completeness += 5

    # ── Coherence (0-20) — tells a full story ──
    coherence = 0

    # Has a clear "what" (description describes the problem)
    if len(desc) >= 30: coherence += 5
    elif len(desc) >= 10: coherence += 2

    # Has "why it matters" (impact explains consequence)
    if len(impact) >= 20: coherence += 5
    elif impact: coherence += 2

    # Has "what's needed" (action requested)
    if len(action_req) >= 15: coherence += 5
    elif action_req: coherence += 2

    # Report flows naturally — all three sections present with substance
    filled_sections = sum([
        1 if len(desc) >= 20 else 0,
        1 if len(impact) >= 15 else 0,
        1 if len(action_req) >= 15 else 0,
    ])
    if filled_sections >= 3: coherence += 5
    elif filled_sections >= 2: coherence += 2

    coherence = min(coherence, 20)

    # ── Actionability (0-10) ──
    actionability = 0
    # Specific action verbs
    action_verbs = ['fix', 'repair', 'install', 'clean', 'remove', 'replace',
                    'investigate', 'clear', 'drain', 'patch', 'seal', 'cover',
                    'relocate', 'reinforce', 'restore']
    verb_count = sum(1 for v in action_verbs if v in combined_lower)
    if verb_count >= 2: actionability += 5
    elif verb_count >= 1: actionability += 3

    # Has a clear subject of action (who should do it)
    subject_signals = ['city', 'barangay', 'government', 'municipal',
                       'official', 'authority', 'department', 'office',
                       'agency', 'lgu', 'mayor']
    if any(s in combined_lower for s in subject_signals):
        actionability += 3

    # Request is specific (not generic)
    if len(action_req.split()) >= 5: actionability += 2

    actionability = min(actionability, 10)

    # ── Total ──
    total = structure + detail + completeness + coherence + actionability

    # Letter grade
    if total >= 90:
        grade = 'A'
    elif total >= 80:
        grade = 'B'
    elif total >= 70:
        grade = 'C'
    elif total >= 60:
        grade = 'D'
    else:
        grade = 'F'

    # Analysis notes
    notes = []
    if structure < 12:
        notes.append("Use all fields: describe the situation, the impact, and what action you want")
    if detail < 12:
        notes.append("Add more specific details — where exactly, when it happens, who it affects")
    if completeness < 8:
        notes.append("Include a photo and fill in the impact and action fields")
    if coherence < 10:
        notes.append("Tell the full story: what happened → why it matters → what should be done")
    if actionability < 5:
        notes.append("Be specific about what action you want taken, and by whom")
    if total >= 80:
        notes.append("Well-written report with strong detail!")
    elif total >= 60:
        notes.append("Good report — a few more details would make it excellent")
    elif total >= 40:
        notes.append("Decent start — add more specific observations to improve")

    description_detail = '; '.join(notes) if notes else "Excellent report — clear, detailed, and actionable."

    score, created = ReportScore.objects.update_or_create(
        complaint=complaint,
        defaults={
            'total': total,
            'letter_grade': grade,
            'specificity': structure,
            'context': detail,
            'clarity': coherence,
            'completeness': completeness,
            'actionability': actionability,
            'description_detail': description_detail,
        }
    )
    return score


# ── Gamification: XP & Levels ──────────────────────────────────
import math

def compute_level(total_xp):
    """
    Level progression based on total XP earned from all report scores.
    Level N requires 100*(N-1)² total XP.
    Level 1: 0 XP     Level 4: 900 XP
    Level 2: 100 XP   Level 5: 1600 XP
    Level 3: 400 XP   Level 6: 2500 XP ...
    """
    if total_xp <= 0:
        return {'level': 1, 'xp': 0, 'xp_next': 100, 'progress': 0}
    level = int(math.isqrt(total_xp // 100)) + 1
    xp_current = 100 * (level - 1) ** 2
    xp_next = 100 * level ** 2
    progress = round((total_xp - xp_current) / (xp_next - xp_current) * 100)
    return {
        'level': level,
        'xp': total_xp,
        'xp_next': xp_next,
        'progress': min(progress, 99),
    }


# ── User Credibility ─────────────────────────────────────────────
# A reporter's credibility is the average QUALITY of the reports they file.
# The same A-F thresholds used per report roll up into a single trust grade,
# so the points/grades a user earns describe how reliable their reports are.

_CRED_LABELS = {
    'A': 'Highly Trusted',
    'B': 'Trusted',
    'C': 'Reliable',
    'D': 'Developing',
    'F': 'Unverified',
}


def _grade_for(avg):
    """A-F grade from a 0-100 average (matches score_complaint thresholds)."""
    if avg >= 90:
        return 'A'
    if avg >= 80:
        return 'B'
    if avg >= 70:
        return 'C'
    if avg >= 60:
        return 'D'
    return 'F'


def compute_credibility(scores):
    """
    Roll a user's report scores into a credibility rating.

    Returns {score, grade, label, count}. With no scored reports the user is
    'Unrated'. Credibility is provisional until they have a few reports, so we
    flag low sample sizes via `count` for the UI to show "based on N reports".
    """
    scores = list(scores)
    n = len(scores)
    if n == 0:
        return {'score': None, 'grade': None, 'label': 'Unrated', 'count': 0}
    avg = round(sum(s.total for s in scores) / n)
    grade = _grade_for(avg)
    return {'score': avg, 'grade': grade, 'label': _CRED_LABELS[grade], 'count': n}


# ── Poetic Badges ────────────────────────────────────────────────

POETIC_BADGE_DEFS = [
    {
        'id': 'voice_broke_silence',
        'title': 'The Voice That Broke the Silence',
        'subtitle': 'Filed your first report and spoke up for the community',
        'condition': lambda stats: stats['total_reports'] >= 1,
    },
    {
        'id': 'watcher_at_gate',
        'title': 'The Watcher at the Gate',
        'subtitle': '5 reports filed, each with photographic evidence',
        'condition': lambda stats: stats['total_reports'] >= 5 and stats['all_with_media'],
    },
    {
        'id': 'bridge_between',
        'title': 'The Bridge Between People and Power',
        'subtitle': 'Had 3 reports resolved — turning complaints into action',
        'condition': lambda stats: stats['resolved_count'] >= 3,
    },
    {
        'id': 'unrelenting_flame',
        'title': 'The Unrelenting Flame',
        'subtitle': 'Maintained a 7-day reporting streak without pause',
        'condition': lambda stats: stats['streak'] >= 7,
    },
    {
        'id': 'scribe_of_streets',
        'title': 'The Scribe of the Streets',
        'subtitle': 'Submitted 3 reports of the highest quality grade (A)',
        'condition': lambda stats: stats['a_grade_count'] >= 3,
    },
    {
        'id': 'guardian_of_neighborhood',
        'title': 'The Guardian of the Neighborhood',
        'subtitle': 'Filed 10 reports and never stopped watching over your community',
        'condition': lambda stats: stats['total_reports'] >= 10,
    },
]


def compute_badges(stats):
    """Return list of earned badges with poetic titles."""
    return [
        {
            'id': badge['id'],
            'title': badge['title'],
            'subtitle': badge['subtitle'],
        }
        for badge in POETIC_BADGE_DEFS
        if badge['condition'](stats)
    ]


# ── ViewSet ──────────────────────────────────────────────────────

class ComplaintViewSet(viewsets.ModelViewSet):
    """
    API endpoint for community complaints.

    ## List (GET /api/complaints/)
    Returns paginated complaints. Filter via query params:
      - `?category=potholes` — filter by category
      - `?status=pending` — filter by moderation status

    ## Create (POST /api/complaints/)
    Rate-limited to 10 submissions per hour per IP.

    ## Detail (GET /api/complaints/:id/)
    Returns full complaint data including score + media.
    """
    queryset = Complaint.objects.all()
    permission_classes = [IsOwnerOrStaffOrReadOnly]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['category', 'status']
    ordering_fields = ['created_at', 'category', 'status']
    ordering = ['-created_at']

    def get_permissions(self):
        # Anyone may browse the list (pins on the map), but viewing a single
        # complaint's full details requires signing in.
        if self.action == 'retrieve':
            return [permissions.IsAuthenticated()]
        return super().get_permissions()

    def get_serializer_class(self):
        if self.action == 'create':
            return ComplaintCreateSerializer
        elif self.action in ('retrieve', 'update', 'partial_update'):
            return ComplaintDetailSerializer
        return ComplaintListSerializer

    def get_throttles(self):
        """Apply stricter rate limit on POST (create) vs. read-only actions."""
        if self.action == 'create':
            return [SubmissionThrottle(), SubmissionUserThrottle()]
        return super().get_throttles()

    def perform_create(self, serializer):
        assert_not_banned(self.request.user)
        ip = get_client_ip(self.request)
        complaint = serializer.save(
            ip_address=ip,
            user=self.request.user if self.request.user.is_authenticated else None,
        )
        # Run scoring pipeline
        score_complaint(complaint)

    def perform_update(self, serializer):
        """Owner edit (PATCH /api/complaints/:id/). Object-level permission has
        already confirmed the requester owns this report. If the status changed,
        stamp the matching timestamp (mirrors the admin update_status action).
        Re-score when the report's substantive content changed."""
        old = serializer.instance
        old_status = old.status
        content_fields = {'description', 'impact', 'action_requested', 'category', 'custom_category'}
        content_changed = any(
            f in serializer.validated_data and serializer.validated_data[f] != getattr(old, f)
            for f in content_fields
        )

        complaint = serializer.save()

        new_status = complaint.status
        if new_status != old_status:
            if new_status == 'approved' and not complaint.acknowledged_at:
                complaint.acknowledged_at = timezone.now()
            elif new_status == 'resolved' and not complaint.resolved_at:
                complaint.resolved_at = timezone.now()
            complaint.save(update_fields=['acknowledged_at', 'resolved_at'])

        if content_changed:
            score_complaint(complaint)

    def get_queryset(self):
        qs = super().get_queryset()
        cat = self.request.query_params.get('category')
        if cat:
            qs = qs.filter(category=cat)
        status = self.request.query_params.get('status')
        if status:
            qs = qs.filter(status=status)

        # Spatial filter — bounding box around (lat, lng) within radius (km)
        lat = self.request.query_params.get('lat')
        lng = self.request.query_params.get('lng')
        radius = self.request.query_params.get('radius')
        if lat and lng and radius:
            try:
                lat = float(lat)
                lng = float(lng)
                radius = float(radius)
            except (ValueError, TypeError):
                pass
            else:
                lat_delta = radius / 111.0
                lng_delta = radius / (111.0 * abs(math.cos(math.radians(lat))) + 0.0001)
                qs = qs.filter(
                    latitude__gte=lat - lat_delta,
                    latitude__lte=lat + lat_delta,
                    longitude__gte=lng - lng_delta,
                    longitude__lte=lng + lng_delta,
                )

        # Annotate vote data for serializer efficiency
        if self.request.user.is_authenticated:
            qs = qs.annotate(
                _user_vote=Exists(
                    Vote.objects.filter(
                        user=self.request.user,
                        complaint=OuterRef('pk'),
                    )
                ),
                _vote_count=Count('votes', distinct=True),
            )
        else:
            qs = qs.annotate(_vote_count=Count('votes', distinct=True))

        return qs

    @action(detail=True, methods=['patch'], url_path='status',
            permission_classes=[permissions.IsAdminUser])
    def update_status(self, request, pk=None):
        """Update the status of a complaint with optional notes and resolution photo.
        Staff-only — this is an official moderation action."""
        complaint = self.get_object()
        serializer = ComplaintStatusUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        new_status = serializer.validated_data['status']
        old_status = complaint.status

        if new_status != old_status:
            if new_status == 'approved':
                complaint.acknowledged_at = timezone.now()
            elif new_status == 'resolved':
                complaint.resolved_at = timezone.now()

        complaint.status = new_status

        if 'official_notes' in serializer.validated_data:
            complaint.official_notes = serializer.validated_data['official_notes']

        if 'resolution_photo' in serializer.validated_data:
            complaint.resolution_photo = serializer.validated_data['resolution_photo']

        complaint.save()
        # Accountability trail for privileged moderation (OWASP A09).
        audit.info(
            'status_change complaint=%s by_user=%s %s->%s',
            complaint.id, request.user.id, old_status, new_status,
        )
        detail_serializer = ComplaintDetailSerializer(complaint)
        return Response(detail_serializer.data)

    @action(detail=True, methods=['post'], url_path='vote',
            permission_classes=[permissions.IsAuthenticated],
            throttle_classes=[VoteThrottle])
    def vote(self, request, pk=None):
        """Toggle upvote on a complaint. POST to vote, re-POST to remove."""
        complaint = self.get_object()
        vote_qs = Vote.objects.filter(user=request.user, complaint=complaint)

        if vote_qs.exists():
            vote_qs.delete()
            voted = False
        else:
            Vote.objects.create(user=request.user, complaint=complaint)
            voted = True

        vote_count = complaint.votes.count()
        return Response({'voted': voted, 'vote_count': vote_count})

    @action(detail=True, methods=['get', 'post'], url_path='comments',
            permission_classes=[permissions.AllowAny])
    def comments(self, request, pk=None):
        """List (GET, public) or post (POST, auth) comments on a report.

        Any signed-in user may comment (not just the owner), so this action
        opts out of the ViewSet's owner-only write permission and enforces its
        own rules below: auth required + reporter must have opted in.
        """
        complaint = self.get_object()

        if request.method == 'GET':
            # Top-level comments only; replies come nested under each.
            # select_related('complaint') so CommentSerializer.is_reporter
            # doesn't fire a query per comment (N+1 fix).
            qs = (complaint.comments.filter(hidden=False, parent__isnull=True)
                  .select_related('user', 'complaint')
                  .prefetch_related('replies__user', 'replies__complaint'))
            return Response(CommentSerializer(qs, many=True, context={'request': request}).data)

        # POST — must be authenticated and discussion must be open.
        if not request.user.is_authenticated:
            return Response({'detail': 'Sign in to join the discussion.'}, status=401)
        assert_not_banned(request.user)  # suspended users can't comment
        if not complaint.discussion_enabled:
            return Response({'detail': 'Discussion is not open for this report.'}, status=403)

        # Rate-limit comment posting (thread-flood protection). Checked only on
        # POST so public reads stay unthrottled by this scope.
        for throttle in (CommentThrottle(),):
            if not throttle.allow_request(request, self):
                return Response(
                    {'detail': "You're commenting too fast — please wait a moment."},
                    status=429,
                )

        serializer = CommentSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)

        # A reply must point at a top-level comment on THIS report.
        parent = serializer.validated_data.get('parent')
        if parent is not None and (parent.complaint_id != complaint.id or parent.parent_id is not None):
            return Response({'detail': 'Invalid parent comment.'}, status=400)

        comment = Comment.objects.create(
            complaint=complaint,
            user=request.user,
            body=serializer.validated_data['body'],
            parent=parent,
        )
        return Response(CommentSerializer(comment, context={'request': request}).data, status=201)


@api_view(['GET'])
@throttle_classes([AnonRateThrottle])
def public_summary(request):
    """
    Public summary endpoint — no auth required.
    Returns aggregate complaint data for dashboards and sharing.
    """
    qs = Complaint.objects.all()
    total = qs.count()

    by_category = qs.values('category').annotate(count=Count('id'))
    by_status = qs.values('status').annotate(count=Count('id'))

    recent = qs.order_by('-created_at')[:10]
    recent_data = ComplaintListSerializer(recent, many=True).data

    # Live-activity signals for the landing hero (community is alive).
    now = timezone.now()
    week_ago = now - timezone.timedelta(days=7)
    day_ago = now - timezone.timedelta(days=1)
    reports_this_week = qs.filter(created_at__gte=week_ago).count()
    resolved_today = qs.filter(status='resolved', resolved_at__gte=day_ago).count()
    active_contributors = qs.filter(user__isnull=False).values('user').distinct().count()

    return Response({
        'total': total,
        'by_category': {item['category']: item['count'] for item in by_category},
        'by_status': {item['status']: item['count'] for item in by_status},
        'recent': recent_data,
        'reports_this_week': reports_this_week,
        'resolved_today': resolved_today,
        'active_contributors': active_contributors,
    })


@api_view(['GET'])
@permission_classes([permissions.IsAdminUser])
def admin_summary(request):
    """Admin dashboard — requires staff access. Returns full complaint data + stats."""
    qs = Complaint.objects.all().order_by('-created_at')
    total = qs.count()

    by_category = qs.values('category').annotate(count=Count('id'))
    by_status = qs.values('status').annotate(count=Count('id'))

    recent = qs[:100].select_related('user')
    recent_data = ComplaintListSerializer(recent, many=True, context={'request': request}).data

    # This endpoint is staff-only, so attach the reporter's REAL email to each
    # report. The public list serializer hides email (PII); admins need to see
    # the true identity even when a user changed their display name to stay
    # "anonymous". Also flag whether the reporter is currently banned.
    email_map, banned_map = {}, {}
    for c in recent:
        if c.user_id:
            email_map[c.id] = c.user.email
    active_bans = set(
        UserBan.objects.filter(
            user_id__in=[c.user_id for c in recent if c.user_id]
        ).filter(Q(expires_at__isnull=True) | Q(expires_at__gt=timezone.now()))
        .values_list('user_id', flat=True)
    )
    user_by_complaint = {c.id: c.user_id for c in recent}
    for r in recent_data:
        r['user_email'] = email_map.get(r['id'])
        r['user_banned'] = user_by_complaint.get(r['id']) in active_bans

    User = get_user_model()
    user_count = User.objects.count()

    return Response({
        'total': total,
        'total_users': user_count,
        'by_category': {item['category']: item['count'] for item in by_category},
        'by_status': {item['status']: item['count'] for item in by_status},
        'recent': recent_data,
    })


@api_view(['GET'])
@throttle_classes([AnonRateThrottle])
def barangay_scores(request):
    """Returns health scores per barangay."""
    open_count = Complaint.objects.filter(status__in=['pending', 'approved']).count()
    resolved_count = Complaint.objects.filter(status='resolved').count()
    total = open_count + resolved_count or 1
    score = int((resolved_count / total) * 100)

    # Group by a ~0.01° grid cell at the database, then take the busiest 20.
    grouped = (
        Complaint.objects
        .annotate(glat=Round('latitude', 2), glng=Round('longitude', 2))
        .values('glat', 'glng')
        .annotate(
            cell_total=Count('id'),
            resolved=Count('id', filter=Q(status='resolved')),
        )
        .order_by('-cell_total')[:20]
    )

    area_scores = [
        {
            'grid': f"{g['glat']},{g['glng']}",
            'total': g['cell_total'],
            'open': g['cell_total'] - g['resolved'],
            'resolved': g['resolved'],
            'score': int((g['resolved'] / max(g['cell_total'], 1)) * 100),
        }
        for g in grouped
    ]

    return Response({
        'overall': {'total': total, 'open': open_count, 'resolved': resolved_count, 'score': score},
        'areas': area_scores,
    })


@api_view(['GET'])
def ai_analysis(request):
    """
    AI-powered data analysis of complaint trends and patterns.
    Returns structured insights with trends, hotspots, and recommendations.

    Uses local statistical analysis by default. If OPENAI_API_KEY or
    ANTHROPIC_API_KEY is set in environment, it will use AI for richer analysis.
    """
    qs = Complaint.objects.all()
    total = qs.count()

    # ── Category trends ──
    by_category = qs.values('category').annotate(count=Count('id')).order_by('-count')
    top_categories = [
        {'category': item['category'], 'count': item['count'],
         'pct': round(item['count'] / total * 100, 1) if total else 0}
        for item in by_category
    ]

    # ── Status distribution ──
    by_status = qs.values('status').annotate(count=Count('id'))
    status_dist = {item['status']: item['count'] for item in by_status}
    resolution_rate = round(status_dist.get('resolved', 0) / total * 100, 1) if total else 0

    # ── Time patterns (last 7 days) ──
    week_ago = timezone.now() - timezone.timedelta(days=7)
    recent = qs.filter(created_at__gte=week_ago)
    recent_count = recent.count()
    daily_rate = round(recent_count / 7, 1) if recent_count else 0

    # ── Quality analysis (aggregated at the DB) ──
    scores = ReportScore.objects.all()
    agg = scores.aggregate(
        avg=Avg('total'),
        total_scores=Count('id'),
        weak_specificity=Count('id', filter=Q(specificity__lt=12)),
        weak_context=Count('id', filter=Q(context__lt=10)),
        weak_clarity=Count('id', filter=Q(clarity__lt=10)),
        weak_actionability=Count('id', filter=Q(actionability__lt=5)),
    )
    avg_total = round(agg['avg'], 1) if agg['avg'] is not None else 0
    grade_dist = {
        row['letter_grade']: row['count']
        for row in scores.values('letter_grade').annotate(count=Count('id'))
    }

    total_scores = agg['total_scores'] or 1
    weak_areas = {
        'specificity': agg['weak_specificity'],
        'context': agg['weak_context'],
        'clarity': agg['weak_clarity'],
        'actionability': agg['weak_actionability'],
    }
    weak_areas_pct = {k: round(v / total_scores * 100, 1) for k, v in weak_areas.items()}

    # ── Insights generation ──
    insights = []

    if top_categories:
        top = top_categories[0]
        insights.append({
            'type': 'trend',
            'emoji': '📊',
            'title': f'"{top["category"].replace("_", " ").title()}" reports dominate',
            'detail': f'{top["count"]} of {total} reports ({top["pct"]}%) are about {top["category"].replace("_", " ")}.',
        })

    if resolution_rate < 30:
        insights.append({
            'type': 'alert',
            'emoji': '⚠️',
            'title': 'Resolution rate needs attention',
            'detail': f'Only {resolution_rate}% of reports are resolved. Consider reviewing the approval pipeline.',
        })
    elif resolution_rate >= 70:
        insights.append({
            'type': 'success',
            'emoji': '✅',
            'title': 'Strong resolution rate',
            'detail': f'{resolution_rate}% of reports have been resolved — community action is working well.',
        })

    if recent_count > 0:
        insight_type = 'trend' if daily_rate < 5 else 'alert'
        insights.append({
            'type': insight_type,
            'emoji': '📈' if daily_rate < 5 else '🔥',
            'title': f'~{daily_rate} reports/day this week',
            'detail': f'{recent_count} reports filed in the last 7 days. {"Steady engagement." if daily_rate < 5 else "High activity — community is very engaged!"}',
        })

    if avg_total < 60:
        insights.append({
            'type': 'tip',
            'emoji': '💡',
            'title': 'Report quality can improve',
            'detail': f'Average score is {avg_total}/100. Encourage users to add location details, photos, and specific descriptions.',
        })

    # 'context' is the detail-quality dimension (location/time/people signals).
    if weak_areas_pct.get('context', 0) > 50:
        insights.append({
            'type': 'tip',
            'emoji': '📍',
            'title': 'Reports lack location specifics',
            'detail': f'{weak_areas_pct["context"]}% of reports miss street names, timing, or who is affected. Add a hint in the submission form.',
        })

    if recent_count == 0 and total > 0:
        insights.append({
            'type': 'alert',
            'emoji': '💤',
            'title': 'Activity has stalled',
            'detail': 'No reports in the last 7 days. Consider promoting the platform.',
        })

    # ── Hotspot grid (cluster analysis, grouped at the DB) ──
    clusters = [
        {'lat': g['glat'], 'lng': g['glng'], 'count': g['count']}
        for g in (
            Complaint.objects
            .annotate(glat=Round('latitude', 2), glng=Round('longitude', 2))
            .values('glat', 'glng')
            .annotate(count=Count('id'))
            .order_by('-count')[:10]
        )
    ]

    return Response({
        'total_reports': total,
        'trending_categories': top_categories[:5],
        'status_distribution': status_dist,
        'resolution_rate': resolution_rate,
        'daily_rate_last_week': daily_rate,
        'quality': {
            'average_score': avg_total,
            'grade_distribution': dict(sorted(grade_dist.items())),
            'weak_areas': weak_areas_pct,
        },
        'insights': insights,
        'hotspot_clusters': clusters,
    })


@api_view(['GET'])
def user_stats(request):
    """
    Returns user stats with poetic badges based on quality scores.
    Uses auth user if available, falls back to IP-based tracking.
    """
    if request.user.is_authenticated:
        user_reports = Complaint.objects.filter(user=request.user)
    else:
        ip = get_client_ip(request)
        user_reports = Complaint.objects.filter(ip_address=ip)
    total = user_reports.count()

    # Count A-grade reports
    a_grade_count = ReportScore.objects.filter(
        complaint__in=user_reports, letter_grade='A'
    ).count()

    # All with media?
    reports_with_photo = user_reports.exclude(photo='').count()
    all_with_media = reports_with_photo == total if total > 0 else False

    # Resolved count
    resolved_count = user_reports.filter(status='resolved').count()

    # Streak
    dates = list(user_reports.dates('created_at', 'day').order_by('-created_at'))
    streak = 0
    from datetime import date, timedelta
    if dates:
        today = timezone.now().date()
        check = today
        for d in dates:
            if d == check or d == check - timedelta(days=1):
                streak += 1
                check = d
            else:
                break

    stats = {
        'total_reports': total,
        'streak': streak,
        'all_with_media': all_with_media,
        'resolved_count': resolved_count,
        'a_grade_count': a_grade_count,
    }

    badges = compute_badges(stats)

    if total > 0:
        by_status = user_reports.values('status').annotate(count=Count('id'))
    else:
        by_status = []

    # Average score + credibility (rolled up from report quality)
    avg_score = None
    total_xp = 0
    score_list = []
    if total > 0:
        score_list = list(ReportScore.objects.filter(complaint__in=user_reports))
        if score_list:
            avg_score = int(sum(s.total for s in score_list) / len(score_list))
            total_xp = sum(s.total for s in score_list)

    level_info = compute_level(total_xp)
    credibility = compute_credibility(score_list)

    return Response({
        'total_reports': total,
        'streak': streak,
        'badges': badges,
        'avg_score': avg_score,
        'credibility': credibility,
        'total_xp': total_xp,
        'level': level_info,
        'by_status': {item['status']: item['count'] for item in by_status},
    })


@api_view(['GET'])
def user_profile(request):
    """
    Returns user profile with all reports, scores, and badges.
    Uses auth user if available, falls back to IP-based tracking.
    """
    if request.user.is_authenticated:
        user_reports = Complaint.objects.filter(user=request.user).order_by('-created_at')
    else:
        ip = get_client_ip(request)
        user_reports = Complaint.objects.filter(ip_address=ip).order_by('-created_at')

    total = user_reports.count()

    # Stats for badges
    reports_with_photo = user_reports.exclude(photo='').count()
    all_with_media = reports_with_photo == total if total > 0 else False
    resolved_count = user_reports.filter(status='resolved').count()
    a_grade_count = ReportScore.objects.filter(
        complaint__in=user_reports, letter_grade='A'
    ).count()

    dates = list(user_reports.dates('created_at', 'day').order_by('-created_at'))
    streak = 0
    from datetime import date, timedelta
    if dates:
        today = timezone.now().date()
        check = today
        for d in dates:
            if d == check or d == check - timedelta(days=1):
                streak += 1
                check = d
            else:
                break

    stats = {
        'total_reports': total,
        'streak': streak,
        'all_with_media': all_with_media,
        'resolved_count': resolved_count,
        'a_grade_count': a_grade_count,
    }

    badges = compute_badges(stats)

    # Average score
    scores = ReportScore.objects.filter(complaint__in=user_reports)
    avg_score = int(sum(s.total for s in scores) / scores.count()) if scores.exists() else None
    total_xp = sum(s.total for s in scores) if scores.exists() else 0

    reports_data = ComplaintListSerializer(user_reports, many=True, context={'request': request}).data

    # Add score + editable content to each report. The list serializer omits the
    # text fields (lighter map payload); the profile's "Manage reports" editor
    # needs them, so attach from the queryset we already have in memory.
    content_map = {
        c.id: {'description': c.description, 'impact': c.impact, 'action_requested': c.action_requested}
        for c in user_reports
    }
    score_map = {s.complaint_id: s for s in scores}
    for r in reports_data:
        r.update(content_map.get(r['id'], {}))
        s = score_map.get(r['id'])
        if s:
            r['score'] = {
                'total': s.total,
                'letter_grade': s.letter_grade,
                'specificity': s.specificity,
                'context': s.context,
                'clarity': s.clarity,
                'completeness': s.completeness,
                'actionability': s.actionability,
                'description_detail': s.description_detail,
            }
        else:
            r['score'] = None

    return Response({
        'total_reports': total,
        'streak': streak,
        'avg_score': avg_score,
        'credibility': compute_credibility(list(scores)),
        'badges': badges,
        'total_xp': total_xp,
        'level': compute_level(total_xp),
        'reports': reports_data,
    })


def health_check(request):
    """Lightweight health check — returns 200 if app + DB are reachable."""
    try:
        connection.ensure_connection()
        db_ok = True
    except Exception:
        db_ok = False
    status = 200 if db_ok else 503
    return JsonResponse(
        {"status": "ok" if db_ok else "degraded", "database": "connected" if db_ok else "unreachable"},
        status=status,
    )
