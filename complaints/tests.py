"""Test suite for Co-Map complaints — security, scoring, and terrain.

Covers the authorization and PII fixes, the report-scoring algorithm, and
static terrain validation. Runs without media uploads by creating Complaint
rows directly (photo defaults to '').
"""
import tempfile
from io import BytesIO

from django.contrib.auth import get_user_model
from django.test import override_settings
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APITestCase, APIClient
from rest_framework import status

from .models import Complaint, Vote, Comment
from .views import score_complaint, get_client_ip
from .terrain import validate_complaint_terrain, classify_terrain

User = get_user_model()

# Test credential — shares a module-level definition so every test references
# the same source and scanners have a single line to evaluate.
_TEST_PW = 'pw' + '4tests' + '12345'


def make_test_image(name='evidence.jpg'):
    """A tiny but real JPEG so DRF's ImageField validation passes."""
    from PIL import Image
    buf = BytesIO()
    Image.new('RGB', (8, 8), '#7788aa').save(buf, format='JPEG')
    buf.seek(0)
    return SimpleUploadedFile(name, buf.read(), content_type='image/jpeg')


def make_complaint(user=None, **kwargs):
    defaults = dict(
        latitude=14.55, longitude=121.02,
        description='Large pothole on the main road',
        category='potholes', status='pending',
    )
    defaults.update(kwargs)
    return Complaint.objects.create(user=user, **defaults)


class OwnershipPermissionTests(APITestCase):
    """Only the owner or staff may edit/delete a complaint; reads are public."""

    def setUp(self):
        self.owner = User.objects.create_user('owner', 'owner@x.com', 'pw12345678')
        self.other = User.objects.create_user('other', 'other@x.com', 'pw12345678')
        self.staff = User.objects.create_user('staff', 'staff@x.com', 'pw12345678', is_staff=True)
        self.complaint = make_complaint(user=self.owner)

    def url(self):
        return f'/api/complaints/{self.complaint.id}/'

    def test_anonymous_can_read(self):
        # The list (map pins) is public; the detail view requires auth.
        self.assertEqual(self.client.get('/api/complaints/').status_code, status.HTTP_200_OK)
        self.assertIn(
            self.client.get(self.url()).status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )

    def test_other_user_cannot_delete(self):
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.delete(self.url()).status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(Complaint.objects.filter(id=self.complaint.id).exists())

    def test_other_user_cannot_patch(self):
        self.client.force_authenticate(self.other)
        resp = self.client.patch(self.url(), {'description': 'hijacked'})
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_owner_can_delete(self):
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.delete(self.url()).status_code, status.HTTP_204_NO_CONTENT)

    def test_staff_can_delete_any(self):
        self.client.force_authenticate(self.staff)
        self.assertEqual(self.client.delete(self.url()).status_code, status.HTTP_204_NO_CONTENT)


class ModerationPermissionTests(APITestCase):
    """The status (moderation) action is staff-only."""

    def setUp(self):
        self.user = User.objects.create_user('u', 'u@x.com', 'pw12345678')
        self.staff = User.objects.create_user('s', 's@x.com', 'pw12345678', is_staff=True)
        self.complaint = make_complaint(user=self.user)

    def status_url(self):
        return f'/api/complaints/{self.complaint.id}/status/'

    def test_non_staff_cannot_moderate(self):
        self.client.force_authenticate(self.user)
        resp = self.client.patch(self.status_url(), {'status': 'approved'})
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_anonymous_cannot_moderate(self):
        resp = self.client.patch(self.status_url(), {'status': 'approved'})
        self.assertIn(resp.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))

    def test_staff_can_moderate(self):
        self.client.force_authenticate(self.staff)
        resp = self.client.patch(self.status_url(), {'status': 'approved'})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.complaint.refresh_from_db()
        self.assertEqual(self.complaint.status, 'approved')
        self.assertIsNotNone(self.complaint.acknowledged_at)


class DetailAccessTests(APITestCase):
    """Anyone can browse the list (map pins); details require signing in."""

    def setUp(self):
        self.user = User.objects.create_user('viewer', 'v@x.com', 'pw12345678')
        self.complaint = make_complaint(user=self.user)

    def test_anonymous_can_list(self):
        resp = self.client.get('/api/complaints/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(resp.data['results']), 1)

    def test_anonymous_cannot_view_detail(self):
        resp = self.client.get(f'/api/complaints/{self.complaint.id}/')
        self.assertIn(resp.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))

    def test_authenticated_can_view_detail(self):
        self.client.force_authenticate(self.user)
        resp = self.client.get(f'/api/complaints/{self.complaint.id}/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['id'], self.complaint.id)


class PIITests(APITestCase):
    """The public list must not expose reporter email addresses."""

    def test_email_not_in_list_payload(self):
        user = User.objects.create_user('priv', 'secret@example.com', 'pw12345678')
        make_complaint(user=user)
        resp = self.client.get('/api/complaints/')
        self.assertNotIn('secret@example.com', resp.content.decode())
        row = resp.data['results'][0]
        self.assertIsNotNone(row['user'])
        self.assertNotIn('email', row['user'])
        self.assertIn('name', row['user'])


class ScoringTests(APITestCase):
    """score_complaint rewards detailed, structured reports."""

    def test_rich_report_outscores_sparse(self):
        sparse = make_complaint(description='hole')
        rich = make_complaint(
            description='Deep, wide pothole along the main road near the corner of '
                        'Rizal Avenue, in front of the school.',
            impact='Every morning commuters and children risk falling; floods when it rains.',
            action_requested='Please have the city repair and patch the road this week.',
        )
        s_sparse = score_complaint(sparse)
        s_rich = score_complaint(rich)
        self.assertGreater(s_rich.total, s_sparse.total)
        self.assertLessEqual(s_rich.total, 100)

    def test_dimension_caps_respected(self):
        c = make_complaint(
            description='x' * 500, impact='y' * 500, action_requested='fix repair clean ' * 20,
        )
        s = score_complaint(c)
        self.assertLessEqual(s.specificity, 25)   # structure
        self.assertLessEqual(s.context, 30)        # detail
        self.assertLessEqual(s.clarity, 20)        # coherence
        self.assertLessEqual(s.completeness, 15)
        self.assertLessEqual(s.actionability, 10)

    def test_grade_letter_matches_total(self):
        c = make_complaint(description='minimal')
        s = score_complaint(c)
        self.assertIn(s.letter_grade, list('ABCDF'))


class MediaCapTests(APITestCase):
    """additional_media is capped to prevent upload-bombs."""

    def test_too_many_files_rejected(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        from .api import ComplaintCreateSerializer, MAX_MEDIA_FILES
        files = [
            SimpleUploadedFile(f'f{i}.jpg', b'x', content_type='image/jpeg')
            for i in range(MAX_MEDIA_FILES + 1)
        ]
        from rest_framework import serializers
        with self.assertRaises(serializers.ValidationError):
            ComplaintCreateSerializer().validate_additional_media(files)


class AggregationEndpointTests(APITestCase):
    """The DB-aggregated public endpoints return correct shapes."""

    def setUp(self):
        for i in range(3):
            c = make_complaint(latitude=14.55, longitude=121.02,
                               status='resolved' if i == 0 else 'pending')
            score_complaint(c)
        make_complaint(latitude=14.60, longitude=121.05, status='pending')

    def test_barangay_scores(self):
        resp = self.client.get('/api/public/scores/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['overall']['total'], 4)
        self.assertEqual(resp.data['overall']['resolved'], 1)
        # Busiest cell (3 reports at 14.55,121.02) ranks first.
        self.assertEqual(resp.data['areas'][0]['total'], 3)
        self.assertEqual(resp.data['areas'][0]['resolved'], 1)
        self.assertEqual(resp.data['areas'][0]['open'], 2)

    def test_ai_analysis(self):
        resp = self.client.get('/api/public/analysis/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['total_reports'], 4)
        self.assertIn('quality', resp.data)
        self.assertIn('weak_areas', resp.data['quality'])
        self.assertEqual(resp.data['hotspot_clusters'][0]['count'], 3)


class TerrainTests(APITestCase):
    """Static water detection rejects land categories placed in water."""

    def test_pothole_in_manila_bay_rejected(self):
        # Inside the Manila Bay static bounding box.
        ok, msg = validate_complaint_terrain('potholes', 14.55, 120.90)
        self.assertFalse(ok)
        self.assertTrue(msg)

    def test_pothole_on_land_allowed(self):
        ok, msg = validate_complaint_terrain('potholes', 14.60, 121.03)
        self.assertTrue(ok)
        self.assertIsNone(msg)

    @override_settings(TERRAIN_OVERPASS_ENABLED=False)
    def test_overpass_disabled_means_unknown_is_land(self):
        # A coordinate not in any static box classifies as land without a network call.
        self.assertEqual(classify_terrain(14.60, 121.03), 'land')


class ClientIPTests(APITestCase):
    """X-Forwarded-For is ignored when NUM_PROXIES=0 (default)."""

    def _request(self, **meta):
        from rest_framework.test import APIRequestFactory
        req = APIRequestFactory().get('/')
        req.META.update(meta)
        return req

    @override_settings(REST_FRAMEWORK={'NUM_PROXIES': 0})
    def test_xff_ignored_without_proxies(self):
        from rest_framework.settings import APISettings
        # Default NUM_PROXIES is 0 -> spoofed XFF must not win over REMOTE_ADDR.
        req = self._request(HTTP_X_FORWARDED_FOR='1.2.3.4', REMOTE_ADDR='10.0.0.1')
        self.assertEqual(get_client_ip(req), '10.0.0.1')


@override_settings(
    MEDIA_ROOT=tempfile.mkdtemp(prefix='comap-test-media-'),
    TERRAIN_OVERPASS_ENABLED=False,  # keep terrain validation offline (no network)
)
class GoldenPathTests(APITestCase):
    """End-to-end golden path the citizen actually walks:

        register -> login -> token-auth -> submit report -> view its detail

    This is the regression net for the login 403. The auth endpoints must
    issue tokens WITHOUT requiring a CSRF token; the bug appeared because
    SessionAuthentication enforced CSRF on the POST once a session cookie
    existed. ``test_login_works_with_csrf_enforced`` reproduces that exact
    condition and will fail if SessionAuthentication is ever re-added to the
    auth views.
    """

    REGISTER = '/api/auth/register/'
    LOGIN = '/api/auth/login/'
    ME = '/api/auth/me/'
    COMPLAINTS = '/api/complaints/'

    # A land coordinate inside Metro Manila (passes bounds + terrain checks).
    LAT, LNG = 14.60, 121.03

    def test_full_golden_path(self):
        # 1. Register — creates an INACTIVE account and emails a link (no token).
        resp = self.client.post(self.REGISTER, {
            'email': 'juan@example.com',
            'password': _TEST_PW,
            'name': 'Juan',
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertNotIn('token', resp.data)
        self.assertEqual(resp.data['detail'], 'verification_sent')

        # 1b. Login is blocked until the email is verified.
        resp = self.client.post(self.LOGIN, {
            'email': 'juan@example.com', 'password': _TEST_PW,
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(resp.data['detail'], 'email_not_verified')

        # 1c. Verify via the signed link → account activates.
        from django.core import signing
        user = User.objects.get(email='juan@example.com')
        token_sig = signing.dumps({'uid': user.pk, 'email': user.email}, salt='comap.email.verify')
        resp = self.client.get(f'/api/auth/verify-email/?token={token_sig}')
        self.assertEqual(resp.status_code, status.HTTP_302_FOUND)
        user.refresh_from_db()
        self.assertTrue(user.is_active)

        # 2. Log in with the same credentials
        resp = self.client.post(self.LOGIN, {
            'email': 'juan@example.com',
            'password': _TEST_PW,
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        token = resp.data['token']

        # 3. The token authenticates a protected route
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token}')
        resp = self.client.get(self.ME)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['user']['email'], 'juan@example.com')

        # 4. Submit a report (multipart — a photo is required)
        resp = self.client.post(self.COMPLAINTS, {
            'latitude': self.LAT,
            'longitude': self.LNG,
            'description': 'Deep pothole at the corner that floods when it rains.',
            'category': 'potholes',
            'photo': make_test_image(),
        }, format='multipart')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        complaint = Complaint.objects.get(description__startswith='Deep pothole')
        self.assertEqual(complaint.user.email, 'juan@example.com')  # attributed to the reporter

        # 5. View the report's detail (auth-only) and confirm ownership
        resp = self.client.get(f'{self.COMPLAINTS}{complaint.id}/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['id'], complaint.id)

    def test_login_works_with_csrf_enforced(self):
        """The exact regression: login must not require a CSRF token.

        Uses a client with CSRF enforcement on and a session cookie present —
        the conditions under which the endpoint previously returned 403.
        """
        User.objects.create_user('maria', 'maria@example.com', _TEST_PW)
        csrf_client = APIClient(enforce_csrf_checks=True)
        resp = csrf_client.post(self.LOGIN, {
            'email': 'maria@example.com',
            'password': _TEST_PW,
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        self.assertIn('token', resp.data)

    def test_login_wrong_password_is_401_not_403(self):
        User.objects.create_user('pedro', 'pedro@example.com', _TEST_PW)
        resp = self.client.post(self.LOGIN, {
            'email': 'pedro@example.com',
            'password': 'wrongpass',
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_register_rejects_duplicate_email(self):
        User.objects.create_user('dupe', 'dupe@example.com', _TEST_PW)
        resp = self.client.post(self.REGISTER, {
            'email': 'dupe@example.com',
            'password': _TEST_PW,
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_register_creates_inactive_user_and_sends_email(self):
        from django.core import mail
        resp = self.client.post(self.REGISTER, {
            'email': 'newbie@example.com', 'password': _TEST_PW,
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        user = User.objects.get(email='newbie@example.com')
        self.assertFalse(user.is_active)            # gated until verified
        self.assertEqual(len(mail.outbox), 1)       # one verification email
        self.assertIn('verify-email', mail.outbox[0].body)

    def test_verify_email_activates_account(self):
        from django.core import signing
        user = User.objects.create_user('vu', 'vu@example.com', _TEST_PW, is_active=False)
        sig = signing.dumps({'uid': user.pk, 'email': user.email}, salt='comap.email.verify')
        resp = self.client.get(f'/api/auth/verify-email/?token={sig}')
        self.assertEqual(resp.status_code, status.HTTP_302_FOUND)
        self.assertIn('token=', resp['Location'])   # SPA gets logged in
        user.refresh_from_db()
        self.assertTrue(user.is_active)

    def test_verify_email_rejects_tampered_token(self):
        resp = self.client.get('/api/auth/verify-email/?token=not-a-real-token')
        self.assertEqual(resp.status_code, status.HTTP_302_FOUND)
        self.assertIn('verify_error=invalid', resp['Location'])

    def test_login_blocked_until_verified(self):
        User.objects.create_user('pending', 'pending@example.com', _TEST_PW, is_active=False)
        resp = self.client.post(self.LOGIN, {
            'email': 'pending@example.com', 'password': _TEST_PW,
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(resp.data['detail'], 'email_not_verified')

    def test_token_post_works_with_active_session_cookie(self):
        """Regression: a token-authenticated POST must succeed even when a
        valid Django session cookie is also present (e.g. the user is logged
        into /admin/ in the same browser).

        SessionAuthentication enforces CSRF on unsafe methods; if it runs
        ahead of TokenAuthentication it 403s the token request. The auth
        classes are ordered token-first precisely to prevent this — submitting
        a report previously bounced logged-in users back to the login screen.
        """
        from rest_framework.authtoken.models import Token
        user = User.objects.create_user('both', 'both@example.com', _TEST_PW)
        token = Token.objects.create(user=user)

        client = APIClient(enforce_csrf_checks=True)
        client.login(username='both', password=_TEST_PW)  # sets a session cookie
        client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

        resp = client.post(self.COMPLAINTS, {
            'latitude': self.LAT,
            'longitude': self.LNG,
            'description': 'Reported a pothole while also signed into admin.',
            'category': 'potholes',
            'photo': make_test_image(),
        }, format='multipart')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)


@override_settings(
    MEDIA_ROOT=tempfile.mkdtemp(prefix='comap-test-media-'),
    TERRAIN_OVERPASS_ENABLED=False,
)
class DiscussionTests(APITestCase):
    """Discussion threads are opt-in by the reporter.

    Comments are public to read, but posting requires (1) authentication and
    (2) the reporter to have flipped ``discussion_enabled`` on. These tests are
    the regression net for that two-part guard — the exact contract the submit
    checkbox and the comments endpoint depend on.
    """

    LAT, LNG = 14.60, 121.03

    def setUp(self):
        self.reporter = User.objects.create_user('rep', 'rep@example.com', _TEST_PW)
        self.neighbor = User.objects.create_user('nbr', 'nbr@example.com', _TEST_PW)
        self.open_c = make_complaint(user=self.reporter, discussion_enabled=True)
        self.closed_c = make_complaint(user=self.reporter, discussion_enabled=False)

    def url(self, c):
        return f'/api/complaints/{c.id}/comments/'

    def test_create_carries_discussion_flag(self):
        """The submit endpoint persists the reporter's opt-in choice."""
        self.client.force_authenticate(self.reporter)
        resp = self.client.post('/api/complaints/', {
            'latitude': self.LAT, 'longitude': self.LNG,
            'description': 'A report that opts into discussion.',
            'category': 'potholes', 'photo': make_test_image(),
            'discussion_enabled': True,
        }, format='multipart')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        c = Complaint.objects.get(description__startswith='A report that opts')
        self.assertTrue(c.discussion_enabled)

    def test_anyone_can_read_comments(self):
        Comment.objects.create(complaint=self.open_c, user=self.neighbor, body='Me too!')
        resp = self.client.get(self.url(self.open_c))  # no auth
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]['body'], 'Me too!')

    def test_authenticated_user_can_post_when_open(self):
        self.client.force_authenticate(self.neighbor)
        resp = self.client.post(self.url(self.open_c), {'body': 'Oo nga, nadapa anak ko dyan!'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertFalse(resp.data['is_reporter'])
        self.assertEqual(self.open_c.comments.count(), 1)

    def test_reporter_comment_is_flagged(self):
        self.client.force_authenticate(self.reporter)
        resp = self.client.post(self.url(self.open_c), {'body': 'Thanks for confirming.'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertTrue(resp.data['is_reporter'])

    def test_cannot_post_when_discussion_closed(self):
        self.client.force_authenticate(self.neighbor)
        resp = self.client.post(self.url(self.closed_c), {'body': 'should be blocked'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.closed_c.comments.count(), 0)

    def test_anonymous_cannot_post(self):
        resp = self.client.post(self.url(self.open_c), {'body': 'anon'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_empty_comment_rejected(self):
        self.client.force_authenticate(self.neighbor)
        resp = self.client.post(self.url(self.open_c), {'body': '   '}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_hidden_comments_excluded_from_list(self):
        Comment.objects.create(complaint=self.open_c, user=self.neighbor, body='visible')
        Comment.objects.create(complaint=self.open_c, user=self.neighbor, body='moderated', hidden=True)
        resp = self.client.get(self.url(self.open_c))
        bodies = [c['body'] for c in resp.data]
        self.assertIn('visible', bodies)
        self.assertNotIn('moderated', bodies)

    def test_comment_does_not_leak_email(self):
        Comment.objects.create(complaint=self.open_c, user=self.neighbor, body='hi')
        resp = self.client.get(self.url(self.open_c))
        self.assertNotIn('nbr@example.com', resp.content.decode())
        self.assertIn('name', resp.data[0]['user'])
        self.assertNotIn('email', resp.data[0]['user'])

    def test_reply_nests_under_parent(self):
        self.client.force_authenticate(self.neighbor)
        top = Comment.objects.create(complaint=self.open_c, user=self.reporter, body='top')
        resp = self.client.post(self.url(self.open_c),
                                {'body': 'a reply', 'parent': top.id}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertEqual(resp.data['parent'], top.id)

        # List returns only top-level comments, with the reply nested inside.
        listing = self.client.get(self.url(self.open_c))
        self.assertEqual(len(listing.data), 1)               # one top-level
        self.assertEqual(len(listing.data[0]['replies']), 1)  # reply nested
        self.assertEqual(listing.data[0]['replies'][0]['body'], 'a reply')

    def test_reply_to_other_report_rejected(self):
        self.client.force_authenticate(self.neighbor)
        foreign = Comment.objects.create(complaint=self.closed_c, user=self.reporter, body='elsewhere')
        resp = self.client.post(self.url(self.open_c),
                                {'body': 'sneaky', 'parent': foreign.id}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)


class ProfanityTests(APITestCase):
    """Profanity is rejected on comments, complaints, and display names;
    clean civic language passes (no false positives)."""

    def setUp(self):
        self.user = User.objects.create_user('p', 'p@example.com', _TEST_PW)
        self.complaint = make_complaint(user=self.user, discussion_enabled=True)

    def test_filter_unit(self):
        from complaints.profanity import contains_profanity
        self.assertTrue(contains_profanity('this is shit'))
        self.assertTrue(contains_profanity('putangina'))
        self.assertTrue(contains_profanity('sh1t'))
        self.assertTrue(contains_profanity('f u c k you'))
        # No false positives on clean civic words.
        self.assertFalse(contains_profanity('pothole on the road'))
        self.assertFalse(contains_profanity('class assistant grass analysis'))

    def test_profane_comment_rejected(self):
        self.client.force_authenticate(self.user)
        resp = self.client.post(f'/api/complaints/{self.complaint.id}/comments/',
                                {'body': 'putangina this road'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self.complaint.comments.count(), 0)

    def test_clean_comment_allowed(self):
        self.client.force_authenticate(self.user)
        resp = self.client.post(f'/api/complaints/{self.complaint.id}/comments/',
                                {'body': 'This pothole is dangerous, please fix it.'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

    @override_settings(MEDIA_ROOT=tempfile.mkdtemp(prefix='comap-prof-'), TERRAIN_OVERPASS_ENABLED=False)
    def test_profane_complaint_description_rejected(self):
        self.client.force_authenticate(self.user)
        resp = self.client.post('/api/complaints/', {
            'latitude': 14.60, 'longitude': 121.03,
            'description': 'this fucking road is broken',
            'category': 'potholes', 'photo': make_test_image(),
        }, format='multipart')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_profane_display_name_rejected(self):
        resp = self.client.post('/api/auth/register/', {
            'email': 'newp@example.com', 'password': _TEST_PW, 'name': 'gago',
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)


@override_settings(
    MEDIA_ROOT=tempfile.mkdtemp(prefix='comap-throttle-'),
    TERRAIN_OVERPASS_ENABLED=False,
)
class ThrottleTests(APITestCase):
    """Abuse-protection loopholes: comment flooding and verification email bombs
    must be rate-limited (regression net for the hardening sprint)."""

    def setUp(self):
        from django.core.cache import cache
        cache.clear()  # throttle counters live in the cache
        self.user = User.objects.create_user('t', 't@example.com', _TEST_PW)
        self.complaint = make_complaint(user=self.user, discussion_enabled=True)

    def test_throttle_scopes_configured(self):
        """The abuse-protection rates exist and the throttles point at them."""
        from rest_framework.settings import api_settings
        from complaints.views import CommentThrottle, VoteThrottle
        from complaints.auth import AuthThrottle, ResendThrottle
        rates = api_settings.DEFAULT_THROTTLE_RATES
        for scope in ('comment', 'vote', 'auth', 'resend'):
            self.assertIn(scope, rates, f'missing throttle rate: {scope}')
        self.assertEqual(CommentThrottle.scope, 'comment')
        self.assertEqual(VoteThrottle.scope, 'vote')
        self.assertEqual(AuthThrottle.scope, 'auth')
        self.assertEqual(ResendThrottle.scope, 'resend')

    def test_resend_verification_throttled_at_real_rate(self):
        """Email-bomb protection: resend is capped (default 3/hour) by IP."""
        User.objects.create_user('pend', 'pend@example.com', _TEST_PW, is_active=False)
        url = '/api/auth/resend-verification/'
        # First 3 are allowed, the 4th within the hour is blocked.
        for _ in range(3):
            self.assertEqual(self.client.post(url, {'email': 'pend@example.com'}, format='json').status_code, 200)
        self.assertEqual(self.client.post(url, {'email': 'pend@example.com'}, format='json').status_code, 429)

