"""
seed_testset — wipe existing complaints and seed a realistic test set using
the real report photos in ~/Downloads/reportss.

Creates a spread of reports across Metro Manila:
  - each uses a real category photo
  - a mix of statuses (pending / approved / resolved)
  - ~60% have discussion enabled; the rest are closed to discussion
  - reports with discussion open get a few sample neighbor comments
  - some "I'm affected too" votes sprinkled in

Usage:
    python manage.py seed_testset            # default ~24 reports
    python manage.py seed_testset --count 40
    python manage.py seed_testset --keep      # don't wipe existing first
"""
import os
import random
from pathlib import Path
from datetime import timedelta

from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand
from django.utils import timezone
from django.contrib.auth import get_user_model

User = get_user_model()
from complaints.models import Complaint, ReportScore, Vote, Comment

IMAGE_DIR = Path(os.path.expanduser("~/Downloads/reportss"))

# Map each real image to a category + a realistic write-up.
TEMPLATES = [
    {
        "image": "potholes.webp", "category": "potholes",
        "description": "Deep pothole on the southbound lane near the corner — about 2 feet wide. Several motorcycles have nearly crashed avoiding it.",
        "impact": "Dangerous for riders and slows traffic as cars swerve around it.",
        "action_requested": "Fill and repave the cracked section. A warning cone until then.",
    },
    {
        "image": "broken_street_light.webp", "category": "streetlight",
        "description": "Streetlight at the intersection has been dead for over a week. The whole corner is pitch black after 7 PM.",
        "impact": "Pedestrians can't be seen by drivers; feels unsafe walking home.",
        "action_requested": "Replace the bulb and check the wiring.",
    },
    {
        "image": "streetlight.webp", "category": "streetlight",
        "description": "Three consecutive streetlights along the avenue are out, leaving a long dark stretch.",
        "impact": "Near-miss incidents at night and loitering in the dark.",
        "action_requested": "Restore the lighting for the whole block.",
    },
    {
        "image": "dumping.webp", "category": "illegal_dumping",
        "description": "Pile of household and construction waste dumped on the empty lot corner. It grows every weekend.",
        "impact": "Smell, rats, and clogged drainage when it rains.",
        "action_requested": "Clear the pile and put up a no-dumping sign.",
    },
    {
        "image": "sidewalk.webp", "category": "sidewalk",
        "description": "The sidewalk slab is cracked and lifted, forcing pedestrians onto the road.",
        "impact": "Elderly and kids trip here; wheelchairs can't pass at all.",
        "action_requested": "Re-level and patch the broken section.",
    },
    {
        "image": "drainage.webp", "category": "water",
        "description": "Drainage canal is clogged and overflowing — water pools across the street even on light rain.",
        "impact": "Flash flooding reaches the houses; mud everywhere after.",
        "action_requested": "Dredge and unclog the drainage line.",
    },
    {
        "image": "vandal.webp", "category": "graffiti",
        "description": "Fresh vandalism covering the wall of the corner building. Looks done in the last couple of days.",
        "impact": "Makes the block look neglected; business owners worried.",
        "action_requested": "Clean the wall and consider a CCTV at the corner.",
    },
]

# Sample neighbor comments for discussion-enabled reports.
SAMPLE_COMMENTS = [
    "Oo nga, nadapa anak ko dyan last week!",
    "Same here, nakakatakot dumaan pag gabi.",
    "I reported this to the barangay na rin, walang aksyon.",
    "Buti may nag-post nito, matagal na ito.",
    "Affected din kami sa kabilang kanto.",
    "Sana mapansin na ng city hall.",
    "Grabe, lalong lumalala every week.",
    "Thank you for reporting this!",
]

ANCHOR_LAT, ANCHOR_LNG = 14.5995, 120.9842
LOCATIONS = [
    ("Makati CBD", 0.011, 0.005), ("BGC", 0.025, 0.015),
    ("Quezon City", 0.080, 0.020), ("Ortigas", 0.045, 0.035),
    ("Intramuros", -0.030, -0.010), ("Malate", -0.025, 0.000),
    ("Pasay", -0.010, 0.008), ("Mandaluyong", 0.035, 0.025),
    ("Taguig", 0.020, 0.030), ("Cubao", 0.065, 0.025),
    ("San Juan", 0.045, 0.012), ("Manila", -0.020, -0.008),
]

NEIGHBOR_NAMES = ["Aling Rosa", "Mang Tonyo", "Jen", "Carlo", "Divine", "Boy", "Mara", "Kuya Ben"]


class Command(BaseCommand):
    help = "Wipe complaints and seed a realistic test set from ~/Downloads/reportss images."

    def add_arguments(self, parser):
        parser.add_argument('--count', type=int, default=24, help='Number of reports to create')
        parser.add_argument('--keep', action='store_true', help='Do NOT wipe existing complaints first')

    def handle(self, *args, **options):
        count = options['count']

        if not IMAGE_DIR.exists():
            self.stderr.write(self.style.ERROR(f"Image folder not found: {IMAGE_DIR}"))
            return

        # Load image bytes once.
        images = {}
        for tmpl in TEMPLATES:
            p = IMAGE_DIR / tmpl["image"]
            if p.exists():
                images[tmpl["image"]] = p.read_bytes()
            else:
                self.stderr.write(self.style.WARNING(f"Missing image: {p}"))
        if not images:
            self.stderr.write(self.style.ERROR("No images loaded — aborting."))
            return

        # ── Users: a reporter pool + a demo user ──────────────────
        reporter, _ = User.objects.get_or_create(
            username='demo_user', defaults={'email': 'demo@comap.local'})
        if not reporter.has_usable_password():
            reporter.set_password('demo1234'); reporter.save()

        neighbors = []
        for i, name in enumerate(NEIGHBOR_NAMES):
            u, created = User.objects.get_or_create(
                username=f'neighbor{i+1}',
                defaults={'email': f'neighbor{i+1}@comap.local', 'first_name': name})
            if created:
                u.set_password('neighbor1234'); u.save()
            neighbors.append(u)

        # ── Wipe existing (default) ───────────────────────────────
        if not options['keep']:
            n = Complaint.objects.count()
            Complaint.objects.all().delete()  # cascades to media/score/votes/comments
            self.stdout.write(self.style.WARNING(f"Removed {n} existing complaints (and their comments/votes/scores)."))

        usable = [t for t in TEMPLATES if t["image"] in images]
        now = timezone.now()
        made = 0
        discussion_on = 0

        for i in range(count):
            tmpl = random.choice(usable)
            _, lat_d, lng_d = random.choice(LOCATIONS)
            lat = round(ANCHOR_LAT + lat_d + random.uniform(-0.004, 0.004), 6)
            lng = round(ANCHOR_LNG + lng_d + random.uniform(-0.004, 0.004), 6)

            status = random.choices(['pending', 'approved', 'resolved'], weights=[55, 28, 17])[0]
            age_h = random.randint(2, 24 * 12)
            created = now - timedelta(hours=age_h)
            updated = created + timedelta(hours=random.randint(1, 36))

            # ~60% open to discussion.
            discuss = random.random() < 0.60

            c = Complaint(
                latitude=lat, longitude=lng,
                description=tmpl["description"], impact=tmpl["impact"],
                action_requested=tmpl["action_requested"], category=tmpl["category"],
                status=status, user=random.choice(neighbors + [reporter]),
                created_at=created, updated_at=updated,
                discussion_enabled=discuss,
            )
            if status == 'resolved':
                c.resolved_at = updated
            elif status == 'approved':
                c.acknowledged_at = updated - timedelta(hours=random.randint(1, 10))
            c.save()
            c.photo = ContentFile(images[tmpl["image"]], name=tmpl["image"])
            c.save(update_fields=['photo'])

            # Score most of them.
            if random.random() < 0.8:
                dims = {
                    'specificity': random.randint(10, 25), 'context': random.randint(12, 30),
                    'clarity': random.randint(8, 20), 'completeness': random.randint(6, 15),
                    'actionability': random.randint(4, 10),
                }
                total = sum(dims.values())
                grade = ('A' if total >= 85 else 'B' if total >= 70 else
                         'C' if total >= 55 else 'D' if total >= 40 else 'F')
                ReportScore.objects.create(complaint=c, total=total, letter_grade=grade, **dims)

            # "Affected too" votes.
            for u in random.sample(neighbors, random.randint(0, 5)):
                Vote.objects.get_or_create(user=u, complaint=c)

            # Comments only where discussion is enabled.
            if discuss:
                discussion_on += 1
                for _ in range(random.randint(1, 4)):
                    Comment.objects.create(
                        complaint=c, user=random.choice(neighbors),
                        body=random.choice(SAMPLE_COMMENTS),
                        created_at=created + timedelta(hours=random.randint(1, max(2, age_h))),
                    )

            made += 1

        self.stdout.write(self.style.SUCCESS(
            f"Seeded {made} reports — {discussion_on} with discussion open, "
            f"{made - discussion_on} closed. Images from {IMAGE_DIR}."
        ))
