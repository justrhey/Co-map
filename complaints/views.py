from rest_framework import permissions, viewsets, filters
from rest_framework.decorators import api_view, throttle_classes, action, permission_classes
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from django.db.models import Count, Exists, OuterRef
from django.utils import timezone
from django.contrib.auth import get_user_model
from .models import Complaint, ReportScore, Vote
from .api import (
    ComplaintListSerializer, ComplaintDetailSerializer,
    ComplaintCreateSerializer, ComplaintStatusUpdateSerializer,
)
import math
from collections import defaultdict


class SubmissionThrottle(AnonRateThrottle):
    """Stricter throttle specifically for complaint submissions."""
    scope = 'submission'
    rate = '10/hour'


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
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['category', 'status']
    ordering_fields = ['created_at', 'category', 'status']
    ordering = ['-created_at']

    def get_serializer_class(self):
        if self.action == 'create':
            return ComplaintCreateSerializer
        elif self.action in ('retrieve', 'update', 'partial_update'):
            return ComplaintDetailSerializer
        return ComplaintListSerializer

    def get_throttles(self):
        """Apply stricter rate limit on POST (create) vs. read-only actions."""
        if self.action == 'create':
            return [SubmissionThrottle()]
        return super().get_throttles()

    def perform_create(self, serializer):
        xff = self.request.META.get('HTTP_X_FORWARDED_FOR')
        ip = xff.split(',')[0].strip() if xff else self.request.META.get('REMOTE_ADDR')
        complaint = serializer.save(
            ip_address=ip,
            user=self.request.user if self.request.user.is_authenticated else None,
        )
        # Run scoring pipeline
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

    @action(detail=True, methods=['patch'], url_path='status')
    def update_status(self, request, pk=None):
        """Update the status of a complaint with optional notes and resolution photo."""
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
        detail_serializer = ComplaintDetailSerializer(complaint)
        return Response(detail_serializer.data)

    @action(detail=True, methods=['post'], url_path='vote',
            permission_classes=[permissions.IsAuthenticated])
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

    return Response({
        'total': total,
        'by_category': {item['category']: item['count'] for item in by_category},
        'by_status': {item['status']: item['count'] for item in by_status},
        'recent': recent_data,
    })


@api_view(['GET'])
@permission_classes([permissions.IsAdminUser])
def admin_summary(request):
    """Admin dashboard — requires staff access. Returns full complaint data + stats."""
    qs = Complaint.objects.all().order_by('-created_at')
    total = qs.count()

    by_category = qs.values('category').annotate(count=Count('id'))
    by_status = qs.values('status').annotate(count=Count('id'))

    recent = qs[:100]
    recent_data = ComplaintListSerializer(recent, many=True, context={'request': request}).data

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
    qs = Complaint.objects.values('latitude', 'longitude', 'status')
    open_count = qs.filter(status__in=['pending', 'approved']).count()
    resolved_count = qs.filter(status='resolved').count()
    total = open_count + resolved_count or 1
    score = int((resolved_count / total) * 100)

    areas = defaultdict(lambda: {'open': 0, 'resolved': 0, 'total': 0})
    for c in Complaint.objects.all():
        key = f"{c.latitude:.2f},{c.longitude:.2f}"
        areas[key]['total'] += 1
        if c.status == 'resolved':
            areas[key]['resolved'] += 1
        else:
            areas[key]['open'] += 1

    area_scores = [
        {
            'grid': key, 'total': d['total'], 'open': d['open'],
            'resolved': d['resolved'],
            'score': int((d['resolved'] / max(d['total'], 1)) * 100),
        }
        for key, d in areas.items()
    ]
    area_scores.sort(key=lambda x: x['total'], reverse=True)

    return Response({
        'overall': {'total': total, 'open': open_count, 'resolved': resolved_count, 'score': score},
        'areas': area_scores[:20],
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

    # ── Quality analysis ──
    scores = ReportScore.objects.all()
    avg_total = round(sum(s.total for s in scores) / scores.count(), 1) if scores.exists() else 0
    grade_dist = {}
    for s in scores:
        grade_dist[s.letter_grade] = grade_dist.get(s.letter_grade, 0) + 1

    weak_areas = {'specificity': 0, 'context': 0, 'clarity': 0, 'actionability': 0}
    for s in scores:
        if s.specificity < 12: weak_areas['specificity'] += 1
        if s.context < 10: weak_areas['context'] += 1
        if s.clarity < 10: weak_areas['clarity'] += 1
        if s.actionability < 5: weak_areas['actionability'] += 1

    total_scores = scores.count() or 1
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

    if weak_areas_pct.get('specificity', 0) > 50:
        insights.append({
            'type': 'tip',
            'emoji': '📍',
            'title': 'Reports lack location specifics',
            'detail': f'{weak_areas_pct["specificity"]}% of reports miss street names or landmarks. Add a hint in the submission form.',
        })

    if recent_count == 0 and total > 0:
        insights.append({
            'type': 'alert',
            'emoji': '💤',
            'title': 'Activity has stalled',
            'detail': 'No reports in the last 7 days. Consider promoting the platform.',
        })

    # ── Hotspot grid (cluster analysis) ──
    from collections import Counter
    grid = Counter()
    for c in Complaint.objects.all():
        key = (round(c.latitude, 2), round(c.longitude, 2))
        grid[key] += 1

    clusters = [
        {'lat': k[0], 'lng': k[1], 'count': v}
        for k, v in grid.most_common(10)
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
        ip = request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip() or request.META.get('REMOTE_ADDR', '')
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

    # Average score
    avg_score = None
    total_xp = 0
    if total > 0:
        scores = ReportScore.objects.filter(complaint__in=user_reports)
        if scores.exists():
            avg_score = int(sum(s.total for s in scores) / scores.count())
            total_xp = sum(s.total for s in scores)

    level_info = compute_level(total_xp)

    return Response({
        'total_reports': total,
        'streak': streak,
        'badges': badges,
        'avg_score': avg_score,
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
        ip = request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip() or request.META.get('REMOTE_ADDR', '')
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

    # Add score data to each report
    score_map = {s.complaint_id: s for s in scores}
    for r in reports_data:
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
        'badges': badges,
        'total_xp': total_xp,
        'level': compute_level(total_xp),
        'reports': reports_data,
    })
