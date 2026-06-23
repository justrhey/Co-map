from django.contrib import admin
from django.utils.html import format_html
from .models import Complaint, ReportMedia, ReportScore


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


@admin.register(Complaint)
class ComplaintAdmin(admin.ModelAdmin):
    """Admin interface for moderating community complaints."""
    list_display = ['id', 'category_display', 'status_colored', 'user_email', 'photo_thumb', 'score_display', 'created_at']
    list_filter = ['status', 'category', 'created_at', 'updated_at']
    search_fields = ['description', 'impact', 'action_requested', 'ip_address', 'user__email', 'user__first_name']
    date_hierarchy = 'created_at'
    list_select_related = ['user']
    list_per_page = 25
    actions = ['approve_complaints', 'mark_resolved', 'reject_complaints']

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
        colors = {'pending': '#eab308', 'approved': '#22c55e', 'resolved': '#3b82f6'}
        color = colors.get(obj.status, '#666')
        return format_html('<span style="color:{};font-weight:700">⬤ {}</span>', color, obj.get_status_display())
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


@admin.register(ReportMedia)
class ReportMediaAdmin(admin.ModelAdmin):
    list_display = ['id', 'complaint_id', 'media_type', 'uploaded_at']
    list_filter = ['media_type', 'uploaded_at']
    search_fields = ['complaint_id']


@admin.register(ReportScore)
class ReportScoreAdmin(admin.ModelAdmin):
    list_display = ['complaint_id', 'total', 'letter_grade', 'specificity', 'context', 'clarity', 'completeness', 'actionability']
    list_filter = ['letter_grade']
