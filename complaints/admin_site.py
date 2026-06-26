"""Custom AdminSite for Co-Map with dashboard context."""
from django.contrib.admin import AdminSite
from django.contrib.auth.models import User, Group
from django.contrib.auth.admin import UserAdmin, GroupAdmin
from django.db.models import Count


class ComplaintMapAdminSite(AdminSite):
    """Custom admin site that injects dashboard stats into the index."""
    site_header = "Co-Map Administration"
    site_title = "Co-Map Admin"
    index_title = "Dashboard"

    def index(self, request, extra_context=None):
        from complaints.models import Complaint

        context = extra_context or {}

        # ── Aggregate stats ──
        total = Complaint.objects.count()
        if total:
            status_counts = Complaint.objects.values('status').annotate(cnt=Count('id'))
            counts = {s['status']: s['cnt'] for s in status_counts}

            approved = counts.get('approved', 0)
            pending = counts.get('pending', 0)
            resolved = counts.get('resolved', 0)
            rejected = counts.get('rejected', 0)

            context['complaint_stats'] = {
                'total': total,
                'approved': approved,
                'pending': pending,
                'resolved': resolved,
                'rejected': rejected,
                'approved_percent': round(approved / total * 100) if total else 0,
                'pending_percent': round(pending / total * 100) if total else 0,
                'resolved_percent': round(resolved / total * 100) if total else 0,
                'rejected_percent': round(rejected / total * 100) if total else 0,
                'trend_days': 30,
            }

            # ── Recent complaints ──
            context['recent_complaints'] = Complaint.objects.select_related('user').order_by('-created_at')[:8]

            # ── Grade distribution ──
            grade_order = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F']
            raw_grades = Complaint.objects.exclude(score__isnull=True).values('score__letter_grade').annotate(cnt=Count('id'))
            grade_map = {g['score__letter_grade']: g['cnt'] for g in raw_grades}
            context['grade_stats'] = [
                {'grade': g, 'count': grade_map.get(g, 0)}
                for g in grade_order if g in grade_map
            ] or []

        return super().index(request, context)


# Singleton instance — import this everywhere
admin_site = ComplaintMapAdminSite()

# ── Register models (load ModelAdmin classes from admin.py late to avoid circular imports) ──
def _register_models():
    from complaints.admin import ComplaintAdmin, ReportMediaAdmin, ReportScoreAdmin, CommentAdmin, UserBanAdmin
    from complaints.models import Complaint, ReportMedia, ReportScore, Comment, UserBan

    admin_site.register(Complaint, ComplaintAdmin)
    admin_site.register(ReportMedia, ReportMediaAdmin)
    admin_site.register(ReportScore, ReportScoreAdmin)
    admin_site.register(Comment, CommentAdmin)
    admin_site.register(UserBan, UserBanAdmin)
    admin_site.register(User, UserAdmin)
    admin_site.register(Group, GroupAdmin)

_register_models()
