"""
Authentication views — SSO, email/password, and profile management.
Uses django-allauth for social auth and DRF tokens for API auth.
"""
from rest_framework import status, generics, permissions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.authtoken.models import Token
from django.contrib.auth import authenticate, login, logout, get_user_model
from django.contrib.auth.models import User
from django.db.models import Count
from .models import Complaint, ReportScore
from .views import compute_badges, compute_level
from .api import ComplaintListSerializer

UserModel = get_user_model()


class RegisterView(generics.CreateAPIView):
    """Register a new user with email + password."""
    permission_classes = [permissions.AllowAny]

    def create(self, request, *args, **kwargs):
        email = request.data.get('email', '').strip().lower()
        password = request.data.get('password', '')
        name = request.data.get('name', '').strip()

        if not email or not password:
            return Response({'error': 'Email and password are required.'}, status=status.HTTP_400_BAD_REQUEST)
        if len(password) < 8:
            return Response({'error': 'Password must be at least 8 characters.'}, status=status.HTTP_400_BAD_REQUEST)
        if UserModel.objects.filter(email=email).exists():
            return Response({'error': 'An account with this email already exists.'}, status=status.HTTP_400_BAD_REQUEST)

        username = email.split('@')[0]
        # Ensure unique username
        base = username
        i = 1
        while UserModel.objects.filter(username=username).exists():
            username = f"{base}{i}"
            i += 1

        user = UserModel.objects.create_user(
            username=username,
            email=email,
            password=password,
        )
        if name:
            user.first_name = name
            user.save()

        token, _ = Token.objects.get_or_create(user=user)

        return Response({
            'token': token.key,
            'user': {
                'id': user.id,
                'email': user.email,
                'name': user.first_name or user.email.split('@')[0],
                'is_staff': user.is_staff,
            }
        }, status=status.HTTP_201_CREATED)


class LoginView(generics.GenericAPIView):
    """Login with email + password."""
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        email = request.data.get('email', '').strip().lower()
        password = request.data.get('password', '')

        if not email or not password:
            return Response({'error': 'Email and password are required.'}, status=status.HTTP_400_BAD_REQUEST)

        # Try to find user by email
        try:
            user = UserModel.objects.get(email=email)
        except UserModel.DoesNotExist:
            return Response({'error': 'No account found with this email.'}, status=status.HTTP_401_UNAUTHORIZED)

        user = authenticate(request, username=user.username, password=password)
        if user is None:
            return Response({'error': 'Invalid password.'}, status=status.HTTP_401_UNAUTHORIZED)

        login(request, user)
        token, _ = Token.objects.get_or_create(user=user)

        return Response({
            'token': token.key,
            'user': {
                'id': user.id,
                'email': user.email,
                'name': user.first_name or user.email.split('@')[0],
                'is_staff': user.is_staff,
            }
        })


class LogoutView(generics.GenericAPIView):
    """Logout and invalidate token."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        request.user.auth_token.delete()
        logout(request)
        return Response({'ok': True})


class MeView(generics.GenericAPIView):
    """Get current user profile and stats."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, *args, **kwargs):
        user = request.user
        user_reports = Complaint.objects.filter(user=user)
        total = user_reports.count()

        # Stats for badges
        reports_with_photo = user_reports.exclude(photo='').count()
        all_with_media = reports_with_photo == total if total > 0 else False
        resolved_count = user_reports.filter(status='resolved').count()
        a_grade_count = ReportScore.objects.filter(
            complaint__in=user_reports, letter_grade='A'
        ).count()

        from datetime import date, timedelta
        from django.utils import timezone
        dates = list(user_reports.dates('created_at', 'day').order_by('-created_at'))
        streak = 0
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

        scores = ReportScore.objects.filter(complaint__in=user_reports)
        avg_score = int(sum(s.total for s in scores) / scores.count()) if scores.exists() else None
        total_xp = sum(s.total for s in scores) if scores.exists() else 0

        return Response({
            'user': {
                'id': user.id,
                'email': user.email,
                'name': user.first_name or user.email.split('@')[0],
                'is_staff': user.is_staff,
            },
            'total_reports': total,
            'streak': streak,
            'avg_score': avg_score,
            'total_xp': total_xp,
            'level': compute_level(total_xp),
            'badges': badges,
        })


@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def social_auth_urls(request):
    """Return the social auth provider URLs for the frontend."""
    from allauth.socialaccount.providers.google.views import GoogleOAuth2Adapter
    from allauth.socialaccount.providers.github.views import GitHubOAuth2Adapter
    from allauth.account.utils import get_next_redirect_url
    from dj_rest_auth.registration.views import SocialLoginView

    base_url = request.build_absolute_uri('/').rstrip('/')

    return Response({
        'google': f'{base_url}/accounts/google/login/',
        'github': f'{base_url}/accounts/github/login/',
    })
