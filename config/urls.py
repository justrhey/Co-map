"""
URL configuration for the Community Complaint Map API.
"""
from django.urls import path, include
from complaints.admin_site import admin_site
from django.conf import settings
from django.conf.urls.static import static
from rest_framework.routers import DefaultRouter
from complaints.views import ComplaintViewSet, public_summary, admin_summary, barangay_scores, ai_analysis, user_stats, user_profile, health_check
from complaints.auth import RegisterView, LoginView, LogoutView, MeView, social_auth_urls, social_complete, verify_email, ResendVerificationView, AccountView, ChangePasswordView

router = DefaultRouter()
router.register(r'complaints', ComplaintViewSet, basename='complaint')

urlpatterns = [
    path('admin/', admin_site.urls),

    # Social auth (Google/GitHub) — provides /accounts/<provider>/login/
    path('accounts/', include('allauth.urls')),

    # API
    path('api/', include(router.urls)),
    path('api/public/summary/', public_summary, name='public-summary'),
    path('api/public/admin/', admin_summary, name='admin-summary'),
    path('api/public/scores/', barangay_scores, name='barangay-scores'),
    path('api/public/analysis/', ai_analysis, name='ai-analysis'),
    path('api/user/stats/', user_stats, name='user-stats'),
    path('api/user/profile/', user_profile, name='user-profile'),

    # Auth
    path('api/auth/register/', RegisterView.as_view(), name='auth-register'),
    path('api/auth/login/', LoginView.as_view(), name='auth-login'),
    path('api/auth/logout/', LogoutView.as_view(), name='auth-logout'),
    path('api/auth/me/', MeView.as_view(), name='auth-me'),
    path('api/auth/social-urls/', social_auth_urls, name='auth-social-urls'),
    path('api/auth/social-complete/', social_complete, name='auth-social-complete'),
    path('api/auth/verify-email/', verify_email, name='auth-verify-email'),
    path('api/auth/resend-verification/', ResendVerificationView.as_view(), name='auth-resend-verification'),
    path('api/auth/account/', AccountView.as_view(), name='auth-account'),
    path('api/auth/change-password/', ChangePasswordView.as_view(), name='auth-change-password'),

    # Health check
    path('health/', health_check, name='health-check'),
]

# Serve media files in development
urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
