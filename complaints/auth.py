"""
Authentication views — SSO, email/password, and profile management.
Uses django-allauth for social auth and DRF tokens for API auth.
"""
from urllib.parse import urlencode
from rest_framework import status, generics, permissions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.authtoken.models import Token
from rest_framework.throttling import AnonRateThrottle
from django.conf import settings
from django.core import signing
from django.core.mail import send_mail
from django.shortcuts import redirect
from django.contrib.auth import authenticate, login, logout, get_user_model
from django.contrib.auth.models import User
from django.db.models import Count
from .models import Complaint, ReportScore
from .views import compute_badges, compute_level


class AuthThrottle(AnonRateThrottle):
    """Brute-force protection for login/register, keyed by client IP."""
    scope = 'auth'


class ResendThrottle(AnonRateThrottle):
    """Email-bomb protection for verification resends, keyed by client IP."""
    scope = 'resend'
from .api import ComplaintListSerializer
from .profanity import contains_profanity

UserModel = get_user_model()

EMAIL_VERIFY_SALT = 'comap.email.verify'


def _send_verification_email(request, user):
    """Email the user a signed, time-limited verification link."""
    token = signing.dumps({'uid': user.pk, 'email': user.email}, salt=EMAIL_VERIFY_SALT)
    # Link points at the backend verify endpoint, which activates then bounces
    # the user to the SPA (logged in).
    verify_url = request.build_absolute_uri(f'/api/auth/verify-email/?token={token}')
    send_mail(
        subject='Verify your Co-Map account',
        message=(
            f"Welcome to Co-Map!\n\n"
            f"Confirm your email to activate your account:\n{verify_url}\n\n"
            f"This link expires in 3 days. If you didn't sign up, ignore this email."
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=False,
    )


class RegisterView(generics.CreateAPIView):
    """Register a new user with email + password."""
    permission_classes = [permissions.AllowAny]
    throttle_classes = [AuthThrottle]
    # Token-issuing endpoint — no session, so skip SessionAuthentication's
    # CSRF enforcement (a stale sessionid cookie otherwise 403s the POST).
    authentication_classes = []

    def create(self, request, *args, **kwargs):
        email = request.data.get('email', '').strip().lower()
        password = request.data.get('password', '')
        name = request.data.get('name', '').strip()

        if not email or not password:
            return Response({'error': 'Email and password are required.'}, status=status.HTTP_400_BAD_REQUEST)
        if len(password) < 8:
            return Response({'error': 'Password must be at least 8 characters.'}, status=status.HTTP_400_BAD_REQUEST)
        if name and contains_profanity(name):
            return Response({'error': 'Please choose a respectful display name.'}, status=status.HTTP_400_BAD_REQUEST)
        if UserModel.objects.filter(email=email).exists():
            return Response({'error': 'An account with this email already exists.'}, status=status.HTTP_400_BAD_REQUEST)

        username = email.split('@')[0]
        # Ensure unique username
        base = username
        i = 1
        while UserModel.objects.filter(username=username).exists():
            username = f"{base}{i}"
            i += 1

        require_verify = getattr(settings, 'REQUIRE_EMAIL_VERIFICATION', True)

        # When verification is required, create the account INACTIVE — it can't
        # log in until the email link is clicked. When it's off (no SMTP yet),
        # create it active and sign the user straight in.
        user = UserModel.objects.create_user(
            username=username,
            email=email,
            password=password,
            is_active=not require_verify,
        )
        if name:
            user.first_name = name
            user.save()

        if not require_verify:
            # Verification disabled — issue a token and log the user in now.
            token, _ = Token.objects.get_or_create(user=user)
            return Response({
                'token': token.key,
                'user': {
                    'id': user.id, 'email': user.email,
                    'name': user.first_name or user.email.split('@')[0],
                    'is_staff': user.is_staff,
                },
            }, status=status.HTTP_201_CREATED)

        try:
            _send_verification_email(request, user)
        except Exception:
            # Don't leave a half-registered ghost if email sending fails.
            user.delete()
            return Response(
                {'error': 'Could not send the verification email. Please try again.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        # No token yet — the user must verify first.
        return Response({
            'detail': 'verification_sent',
            'message': f'We sent a verification link to {email}. Check your inbox to activate your account.',
            'email': email,
        }, status=status.HTTP_201_CREATED)


class LoginView(generics.GenericAPIView):
    """Login with email + password."""
    permission_classes = [permissions.AllowAny]
    throttle_classes = [AuthThrottle]
    # Token-issuing endpoint — no session, so skip SessionAuthentication's
    # CSRF enforcement (a stale sessionid cookie otherwise 403s the POST).
    authentication_classes = []

    def post(self, request, *args, **kwargs):
        email = request.data.get('email', '').strip().lower()
        password = request.data.get('password', '')

        if not email or not password:
            return Response({'error': 'Email and password are required.'}, status=status.HTTP_400_BAD_REQUEST)

        # Try to find user by email
        try:
            account = UserModel.objects.get(email=email)
        except UserModel.DoesNotExist:
            return Response({'error': 'No account found with this email.'}, status=status.HTTP_401_UNAUTHORIZED)

        require_verify = getattr(settings, 'REQUIRE_EMAIL_VERIFICATION', True)

        if not account.is_active:
            if require_verify:
                # Block unverified accounts with an actionable message (authenticate()
                # would otherwise just return None and look like a wrong password).
                return Response(
                    {'error': 'Please verify your email before signing in. Check your inbox or request a new link.',
                     'detail': 'email_not_verified', 'email': account.email},
                    status=status.HTTP_403_FORBIDDEN,
                )
            # Verification is off — activate legacy accounts that were stuck
            # inactive from before, so they're no longer locked out.
            account.is_active = True
            account.save(update_fields=['is_active'])

        user = authenticate(request, username=account.username, password=password)
        if user is None:
            return Response({'error': 'Invalid password.'}, status=status.HTTP_401_UNAUTHORIZED)

        # Token auth only — no Django session (avoids the CSRF-cookie trap).
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


class AccountView(generics.GenericAPIView):
    """Self-service account management for the signed-in user.

    PATCH  — update display name.
    DELETE — permanently delete the account and all owned reports.
    """
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, *args, **kwargs):
        user = request.user
        name = (request.data.get('name') or '').strip()
        if not name:
            return Response({'error': 'Name cannot be empty.'}, status=status.HTTP_400_BAD_REQUEST)
        if len(name) > 60:
            return Response({'error': 'Name is too long (max 60 characters).'}, status=status.HTTP_400_BAD_REQUEST)
        if contains_profanity(name):
            return Response({'error': 'Please choose a different name.'}, status=status.HTTP_400_BAD_REQUEST)
        user.first_name = name
        user.save(update_fields=['first_name'])
        return Response({'name': user.first_name, 'email': user.email, 'is_staff': user.is_staff})

    def delete(self, request, *args, **kwargs):
        user = request.user
        # Drop the auth token first so the session is dead even if delete races.
        Token.objects.filter(user=user).delete()
        # GDPR Art. 17 (erasure): Complaint.user is SET_NULL, so reports survive
        # as anonymous civic records — but their stored IP is personal data and
        # must not linger detached. Scrub it before the user row is gone.
        Complaint.objects.filter(user=user).update(ip_address=None)
        user.delete()  # cascades to owned comments/votes; complaints are kept (SET_NULL)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ExportDataView(generics.GenericAPIView):
    """GDPR Art. 15 / CCPA right-to-know: return everything stored about the user."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, *args, **kwargs):
        u = request.user
        return Response({
            'account': {
                'email': u.email,
                'name': u.first_name,
                'joined': u.date_joined,
                'is_staff': u.is_staff,
            },
            'reports': list(
                Complaint.objects.filter(user=u).values(
                    'id', 'category', 'custom_category', 'description', 'impact',
                    'action_requested', 'latitude', 'longitude', 'status',
                    'ip_address', 'created_at',
                )
            ),
            'comments': list(
                u.comments.values('id', 'body', 'complaint_id', 'created_at')
            ),
        })


class ChangePasswordView(generics.GenericAPIView):
    """Change the signed-in user's password. Requires the current password."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        user = request.user
        current = request.data.get('current_password') or ''
        new = request.data.get('new_password') or ''

        # Social-only accounts may have no usable password set.
        if user.has_usable_password() and not user.check_password(current):
            return Response({'error': 'Your current password is incorrect.'}, status=status.HTTP_400_BAD_REQUEST)
        if len(new) < 8:
            return Response({'error': 'New password must be at least 8 characters.'}, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(new)
        user.save(update_fields=['password'])
        # Rotate the token so other sessions are signed out.
        Token.objects.filter(user=user).delete()
        token, _ = Token.objects.get_or_create(user=user)
        return Response({'detail': 'password_changed', 'token': token.key})


@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def social_auth_urls(request):
    """Return the social auth provider URLs for the frontend."""
    base_url = request.build_absolute_uri('/').rstrip('/')

    return Response({
        'google': f'{base_url}/accounts/google/login/',
        'github': f'{base_url}/accounts/github/login/',
    })


@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def social_complete(request):
    """Bridge: allauth lands a social-logged-in user here (session auth).

    Mint a DRF token and redirect to the SPA with ?token=… so the React app
    can store it and behave exactly like an email/password login. On failure,
    send the user back to the SPA login page with an error flag.
    """
    frontend = getattr(settings, 'FRONTEND_URL', 'http://localhost:5173')

    if not request.user.is_authenticated:
        return redirect(f"{frontend}/?auth_error=social")

    token, _ = Token.objects.get_or_create(user=request.user)
    # Hand the token to the SPA via the URL fragment-free query string. The SPA
    # reads it on load, stores it, then strips it from the address bar.
    params = urlencode({
        'token': token.key,
        'name': request.user.first_name or request.user.email.split('@')[0],
        'email': request.user.email,
        'is_staff': '1' if request.user.is_staff else '0',
    })
    return redirect(f"{frontend}/?{params}")


@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def verify_email(request):
    """Activate an account from a signed verification link, then redirect to
    the SPA logged in (?token=…). Invalid/expired links bounce with an error."""
    frontend = getattr(settings, 'FRONTEND_URL', 'http://localhost:5173')
    raw = request.query_params.get('token', '')
    max_age = getattr(settings, 'EMAIL_VERIFICATION_MAX_AGE', 60 * 60 * 24 * 3)

    try:
        data = signing.loads(raw, salt=EMAIL_VERIFY_SALT, max_age=max_age)
    except signing.SignatureExpired:
        return redirect(f"{frontend}/?verify_error=expired")
    except signing.BadSignature:
        return redirect(f"{frontend}/?verify_error=invalid")

    try:
        user = UserModel.objects.get(pk=data['uid'], email=data['email'])
    except UserModel.DoesNotExist:
        return redirect(f"{frontend}/?verify_error=invalid")

    if not user.is_active:
        user.is_active = True
        user.save(update_fields=['is_active'])

    # Log them straight in by handing the SPA a token.
    token, _ = Token.objects.get_or_create(user=user)
    params = urlencode({
        'token': token.key,
        'name': user.first_name or user.email.split('@')[0],
        'email': user.email,
        'is_staff': '1' if user.is_staff else '0',
        'verified': '1',
    })
    return redirect(f"{frontend}/?{params}")


class ResendVerificationView(generics.GenericAPIView):
    """Re-send the verification link for an unverified account."""
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ResendThrottle]
    authentication_classes = []

    def post(self, request, *args, **kwargs):
        email = request.data.get('email', '').strip().lower()
        if not email:
            return Response({'error': 'Email is required.'}, status=status.HTTP_400_BAD_REQUEST)

        # Always respond the same way so we don't leak which emails exist.
        try:
            user = UserModel.objects.get(email=email)
            if not user.is_active:
                _send_verification_email(request, user)
        except UserModel.DoesNotExist:
            pass

        return Response({
            'detail': 'verification_sent',
            'message': f'If an unverified account exists for {email}, a new link is on its way.',
        })
