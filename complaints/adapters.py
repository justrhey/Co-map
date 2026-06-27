"""Custom allauth adapters.

The default social flow shows an intermediate signup form
(/accounts/3rdparty/signup/) when it can't silently create the account —
most commonly because the Google email already belongs to an existing
email/password account, or because ACCOUNT_SIGNUP_FIELDS marks a password
required that an OAuth user doesn't have. Both cases dump the user onto a
bare, unstyled Django page instead of the SPA.

This adapter removes that friction: it connects a Google login to an
existing same-email account, and always auto-signs-up new ones.
"""
from django.contrib.auth import get_user_model
from allauth.socialaccount.adapter import DefaultSocialAccountAdapter

User = get_user_model()


class AutoConnectSocialAdapter(DefaultSocialAccountAdapter):
    def is_auto_signup_allowed(self, request, sociallogin):
        # Never fall back to the manual signup form — Google already gives us a
        # verified email, which is all we need to create the account.
        return True

    def pre_social_login(self, request, sociallogin):
        """Before the social login is processed: if the incoming Google email
        matches an existing local account, attach this social login to it so the
        user is logged straight in (no "account already exists" dead-end)."""
        # Already linked to a user — nothing to do.
        if sociallogin.is_existing:
            return

        email = (sociallogin.user.email or '').strip().lower()
        if not email:
            return

        try:
            existing = User.objects.get(email__iexact=email)
        except User.DoesNotExist:
            return

        # A social user signing in for the first time with an email we already
        # have: connect the two and continue as that user.
        sociallogin.connect(request, existing)

    def save_user(self, request, sociallogin, form=None):
        user = super().save_user(request, sociallogin, form=form)
        # Social signups are active immediately — Google verified the email.
        if not user.is_active:
            user.is_active = True
            user.save(update_fields=['is_active'])
        return user
