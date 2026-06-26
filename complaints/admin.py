from django.contrib import admin
from django.utils.html import format_html
from django.utils import timezone
from datetime import timedelta
from .models import Complaint, ReportMedia, ReportScore, Comment, UserBan


class ReportMediaInline(admin.TabularInline):
    model = ReportMedia
    extra = 0
    fields = ['media_type', 'file', 'uploaded_at']
    readonly_fields = ['uploaded_at']
    max_num = 10


class ReportScoreInline(admin.StackedInline):
    model = ReportScore
    extra = 0
    fields = ['total', 'letter_grade', 'specificity', 'context', 'clarity', 'completeness', 'actionability', 'description_detail']
    readonly_fields = ['total', 'letter_grade', 'specificity', 'context', 'clarity', 'completeness', 'actionability', 'description_detail']
    max_num = 1
    can_delete = False


class ComplaintAdmin(admin.ModelAdmin):
    """Admin interface for moderating community complaints."""
    list_display = ['id', 'category_display', 'status_colored', 'user_email', 'photo_thumb', 'score_display', 'created_at']
    list_filter = ['status', 'category', 'created_at', 'updated_at']
    search_fields = ['description', 'impact', 'action_requested', 'ip_address', 'user__email', 'user__first_name']
    date_hierarchy = 'created_at'
    list_select_related = ['user']
    list_per_page = 25
    actions = ['approve_complaints', 'mark_resolved', 'reject_complaints', 'ban_reporters_1_day']

    fieldsets = [
        ('Location', {'fields': ['latitude', 'longitude']}),
        ('Submission', {'fields': ['user', 'ip_address', 'category', 'custom_category']}),
        ('Details', {'fields': ['description', 'impact', 'action_requested', 'photo']}),
        ('Status', {'fields': ['status', 'official_notes', 'resolution_photo', 'acknowledged_at', 'resolved_at']}),
    ]
    readonly_fields = ['acknowledged_at', 'resolved_at', 'created_at', 'updated_at']

    inlines = [ReportMediaInline, ReportScoreInline]

    def category_display(self, obj):
        return obj.get_category_display()
    category_display.short_description = 'Category'
    category_display.admin_order_field = 'category'

    def status_colored(self, obj):
        colors = {'pending': '#eab308', 'approved': '#22c55e', 'resolved': '#3b82f6', 'rejected': '#f85149'}
        color = colors.get(obj.status, '#666')
        badge = format_html(
            '<span style="display:inline-flex;align-items:center;gap:5px;font-weight:600">'
            '<svg width="8" height="8" viewBox="0 0 8 8" style="flex-shrink:0"><circle cx="4" cy="4" r="4" fill="{}"/></svg>'
            '{}</span>',
            color, obj.get_status_display()
        )
        return badge
    status_colored.short_description = 'Status'
    status_colored.admin_order_field = 'status'

    def user_email(self, obj):
        if obj.user:
            return obj.user.email or obj.user.username
        return f'IP: {obj.ip_address or "-"}'
    user_email.short_description = 'User / IP'
    user_email.admin_order_field = 'user__email'

    def photo_thumb(self, obj):
        if obj.photo:
            return format_html('<img src="{}" style="width:48px;height:48px;object-fit:cover;border-radius:4px" />', obj.photo.url)
        return '—'
    photo_thumb.short_description = 'Photo'

    def score_display(self, obj):
        try:
            if hasattr(obj, 'score') and obj.score:
                return format_html('{} <span style="color:#666">({})</span>', obj.score.total, obj.score.letter_grade)
        except ReportScore.DoesNotExist:
            pass
        return '—'
    score_display.short_description = 'Score'
    score_display.admin_order_field = 'score__total'

    @admin.action(description="Approve selected complaints")
    def approve_complaints(self, request, queryset):
        from django.utils import timezone
        updated = queryset.update(status=Complaint.Status.APPROVED, acknowledged_at=timezone.now())
        self.message_user(request, f"{updated} complaint(s) approved.")

    @admin.action(description="Mark selected as resolved")
    def mark_resolved(self, request, queryset):
        from django.utils import timezone
        updated = queryset.update(status=Complaint.Status.RESOLVED, resolved_at=timezone.now())
        self.message_user(request, f"{updated} complaint(s) marked resolved.")

    @admin.action(description="Reject / set back to pending")
    def reject_complaints(self, request, queryset):
        updated = queryset.update(status=Complaint.Status.PENDING, acknowledged_at=None)
        self.message_user(request, f"{updated} complaint(s) set back to pending.")

    @admin.action(description="Ban reporters for 1 day")
    def ban_reporters_1_day(self, request, queryset):
        n = _ban_users({c.user for c in queryset.select_related('user') if c.user}, days=1, by=request.user)
        self.message_user(request, f"Banned {n} reporter(s) for 1 day. Edit the ban to customize the duration.")


class ReportMediaAdmin(admin.ModelAdmin):
    list_display = ['id', 'complaint_id', 'media_type', 'uploaded_at']
    list_filter = ['media_type', 'uploaded_at']
    search_fields = ['complaint_id']


class ReportScoreAdmin(admin.ModelAdmin):
    list_display = ['complaint_id', 'total', 'letter_grade', 'specificity', 'context', 'clarity', 'completeness', 'actionability']
    list_filter = ['letter_grade']


class CommentAdmin(admin.ModelAdmin):
    list_display = ['id', 'complaint_id', 'real_identity', 'short_body', 'hidden', 'created_at']
    list_filter = ['hidden', 'created_at']
    # Search by the true identity (email) even when the public nickname differs.
    search_fields = ['body', 'complaint_id', 'user__email', 'user__first_name']
    list_select_related = ['user']
    actions = ['hide_comments', 'unhide_comments', 'ban_authors_1_day']

    @admin.display(description='Author (nickname · email)')
    def real_identity(self, obj):
        """Show the public nickname AND the real email, so a user staying
        'anonymous' by changing their display name is still identifiable."""
        if not obj.user:
            return '— (deleted)'
        nick = obj.user.first_name or '(no nickname)'
        return format_html('{} · <span style="color:#888">{}</span>', nick, obj.user.email)

    @admin.display(description='Comment')
    def short_body(self, obj):
        return (obj.body[:60] + '…') if len(obj.body) > 60 else obj.body

    @admin.action(description="Hide selected comments")
    def hide_comments(self, request, queryset):
        queryset.update(hidden=True)

    @admin.action(description="Unhide selected comments")
    def unhide_comments(self, request, queryset):
        queryset.update(hidden=False)

    @admin.action(description="Ban comment authors for 1 day")
    def ban_authors_1_day(self, request, queryset):
        n = _ban_users({c.user for c in queryset.select_related('user') if c.user}, days=1, by=request.user)
        self.message_user(request, f"Banned {n} user(s) for 1 day.")


# ── Banning ──────────────────────────────────────────────────────
def _ban_users(users, days, by=None, reason=''):
    """Create or refresh a ban on each user for `days` days. Returns the count."""
    expires = timezone.now() + timedelta(days=days)
    count = 0
    for u in users:
        if not u or u.is_staff:   # never ban staff via bulk actions
            continue
        UserBan.objects.update_or_create(
            user=u,
            defaults={'expires_at': expires, 'created_by': by, 'reason': reason},
        )
        count += 1
    return count


class UserBanAdmin(admin.ModelAdmin):
    """Manage temporary suspensions. Edit `expires_at` to customize duration
    (e.g. set it a few hours out, or clear it for a permanent ban)."""
    list_display = ['user_identity', 'status_badge', 'reason', 'expires_at', 'created_by', 'created_at']
    list_filter = ['created_at', 'expires_at']
    search_fields = ['user__email', 'user__first_name', 'reason']
    list_select_related = ['user', 'created_by']
    autocomplete_fields = ['user']
    readonly_fields = ['created_at']
    actions = ['lift_bans', 'extend_1_day', 'extend_7_days']

    @admin.display(description='User (nickname · email)')
    def user_identity(self, obj):
        if not obj.user:
            return '—'
        nick = obj.user.first_name or '(no nickname)'
        return format_html('{} · <span style="color:#888">{}</span>', nick, obj.user.email)

    @admin.display(description='Status')
    def status_badge(self, obj):
        active = obj.is_active
        color = '#f85149' if active else '#22c55e'
        label = 'ACTIVE' if active else 'expired'
        return format_html('<span style="color:{};font-weight:700">{}</span>', color, label)

    @admin.action(description="Lift (end) selected bans now")
    def lift_bans(self, request, queryset):
        n = queryset.update(expires_at=timezone.now())
        self.message_user(request, f"Lifted {n} ban(s).")

    @admin.action(description="Extend selected bans by 1 day")
    def extend_1_day(self, request, queryset):
        base = timezone.now()
        for ban in queryset:
            start = ban.expires_at if (ban.expires_at and ban.expires_at > base) else base
            ban.expires_at = start + timedelta(days=1)
            ban.save(update_fields=['expires_at'])
        self.message_user(request, f"Extended {queryset.count()} ban(s) by 1 day.")

    @admin.action(description="Extend selected bans by 7 days")
    def extend_7_days(self, request, queryset):
        base = timezone.now()
        for ban in queryset:
            start = ban.expires_at if (ban.expires_at and ban.expires_at > base) else base
            ban.expires_at = start + timedelta(days=7)
            ban.save(update_fields=['expires_at'])
        self.message_user(request, f"Extended {queryset.count()} ban(s) by 7 days.")
