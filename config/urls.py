"""
URL configuration for the Community Complaint Map API.
"""
from django.urls import path, include
from complaints.admin_site import admin_site
from django.conf import settings
from django.conf.urls.static import static
from rest_framework.routers import DefaultRouter
from complaints.views import ComplaintViewSet, public_summary, admin_summary, barangay_scores, ai_analysis, user_stats, user_profile
from complaints.auth import RegisterView, LoginView, LogoutView, MeView, social_auth_urls

router = DefaultRouter()
router.register(r'complaints', ComplaintViewSet, basename='complaint')

urlpatterns = [
    path('admin/', admin_site.urls),

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
]

# Serve media files in development
urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
