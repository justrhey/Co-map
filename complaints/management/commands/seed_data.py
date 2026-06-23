"""
Seed command — populates the database with sample complaints for demo / dev.

Usage:
    python manage.py seed_data              # creates 30 complaints
    python manage.py seed_data --count 100  # custom count
    python manage.py seed_data --clear      # remove existing seed data first
"""
import io
import random
from datetime import timedelta
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand
from django.utils import timezone
from django.contrib.auth import get_user_model

User = get_user_model()
from complaints.models import Complaint, ReportScore, Vote

# ── Metro Manila anchor coordinates ──────────────────────────────────
ANCHOR_LAT, ANCHOR_LNG = 14.5995, 120.9842
LOCATIONS = [
    # (name, lat_delta, lng_delta)  —  roughly ~1-5 km offsets
    ("Makati CBD",          0.011,  0.005),
    ("BGC",                 0.025,  0.015),
    ("Quezon City Hall",    0.080,  0.020),
    ("Ortigas Center",      0.045,  0.035),
    ("Intramuros",         -0.030, -0.010),
    ("Malate",             -0.025,  0.000),
    ("Pasay Rotunda",      -0.010,  0.008),
    ("Mandaluyong",         0.035,  0.025),
    ("Taguig",              0.020,  0.030),
    ("Manila Baywalk",     -0.040, -0.015),
    ("Cubao",               0.065,  0.025),
    ("San Juan",            0.045,  0.012),
]

CATEGORIES = [
    'potholes', 'streetlight', 'graffiti', 'illegal_dumping',
    'sidewalk', 'traffic', 'noise', 'park', 'water', 'other',
]

# ── Clear descriptions (detailed, actionable) ──────────────────────
CLEAR_REPORTS = [
    {
        "description": "A deep pothole approximately 2 feet wide and 6 inches deep on the southbound lane of EDSA near the Guadalupe bridge exit. At least 3 vehicles have blown tires here this week. The surrounding area has visible cracks spreading outward.",
        "impact": "Dangerous for motorcyclists and causes traffic slowdown as vehicles swerve to avoid it. I witnessed a motorcycle accident here last Tuesday.",
        "action_requested": "Fill the pothole and repave the surrounding cracked section. Temporary barricade or warning sign needed until repaired.",
        "category": "potholes",
    },
    {
        "description": "Three consecutive streetlights along Burgos Street in Makati between the corner of Paseo de Roxas and the RCBC building have been out for over two weeks. The entire block is pitch black after 7 PM.",
        "impact": "Safety hazard for pedestrians and motorists. Several near-miss incidents reported by residents. The dark stretch is also attracting loitering at night.",
        "action_requested": "Replace the damaged bulbs and check the underground wiring for that section. Regular maintenance schedule needed.",
        "category": "streetlight",
    },
    {
        "description": "Large graffiti tags covering the entire side wall of the heritage building at the corner of Calle Real and Sta. Barbara Street. The paint appears fresh — done within the last 48 hours based on the drip patterns.",
        "impact": "Defacing a heritage structure devalues the historical character of the district. Local business owners report reduced foot traffic.",
        "action_requested": "Remove the graffiti using appropriate cleaning methods for heritage stonework. Consider installing a CCTV camera at this intersection.",
        "category": "graffiti",
    },
    {
        "description": "An abandoned sofa, two garbage bags of household waste, and construction debris piled at the end of Mauban Street near the wooden footbridge. The pile has been growing for 3 weeks. Rats and stray dogs have been seen scavenging.",
        "impact": "Health hazard — the rotting waste attracts vermin and produces foul odor affecting 5 adjacent houses. Children play near this area.",
        "action_requested": "Schedule a bulk waste pickup and post 'No Dumping' signage. Fine the perpetrators if identified through nearby CCTV.",
        "category": "illegal_dumping",
    },
    {
        "description": "The concrete sidewalk along Shaw Boulevard from the Wack Wack entrance to the BPI bank branch is broken into uneven chunks with exposed rebar sticking out. At least 4 sections are in critical condition spanning about 30 meters.",
        "impact": "Senior citizens and parents with strollers cannot safely use this sidewalk. Someone could trip and fall on the exposed rebar.",
        "action_requested": "Replace the damaged sidewalk sections, remove exposed rebar, and ensure the surface is level across the full stretch.",
        "category": "sidewalk",
    },
    {
        "description": "The traffic light at the intersection of Boni Avenue and Pioneer Street has been stuck on red for all directions since 8 AM this morning. No police officer directing traffic. Gridlock extending 3 blocks in each direction.",
        "impact": "Complete intersection gridlock during peak hours. Emergency vehicles cannot pass through. Commuters stranded for over 45 minutes.",
        "action_requested": "Send a traffic enforcer immediately and dispatch a repair crew to fix the traffic light controller box at this intersection.",
        "category": "traffic",
    },
    {
        "description": "A residential construction site on Scout Reyes Street has been operating heavy machinery and hammering starting at 5:30 AM every day including Saturdays for the past two weeks. The noise exceeds 85 decibels based on my phone meter reading from 30 meters away.",
        "impact": "Unable to sleep past 5:30 AM. Multiple neighbors have complained verbally to the foreman with no change in behavior.",
        "action_requested": "Enforce the city ordinance on construction noise hours (8 AM to 5 PM weekdays only). Issue a warning or fine to the contractor.",
        "category": "noise",
    },
    {
        "description": "The children's playground at the corner of Kamagong Street has a broken swing set with one chain snapped, a slide with a cracked base, and a see-saw missing its center bolt. The rubber safety matting is peeling up creating tripping hazards.",
        "impact": "Children in the neighborhood have no safe place to play. A 7-year-old resident fell from the broken slide last week and scraped his knee badly.",
        "action_requested": "Repair or replace the damaged playground equipment. Inspect all city playgrounds quarterly for safety compliance.",
        "category": "park",
    },
    {
        "description": "The drainage canal along F. Manalo Street is completely clogged with silt, plastic bottles, and discarded clothing. During the last light rain the water rose to knee height within 30 minutes and took 6 hours to subside.",
        "impact": "Flooding enters ground-floor apartments and stores. Residents have lost furniture and inventory worth thousands of pesos.",
        "action_requested": "Desilt and clear the entire drainage canal. Install grate covers at catch basins to prevent solid waste from entering. Monthly cleaning schedule needed.",
        "category": "water",
    },
    {
        "description": "Large colony of bats living in the abandoned water tower on Remedios Street. Bat droppings are accumulating on the ground below and the screeching is audible from 50 meters away starting at sunset.",
        "impact": "Health concern from bat guano accumulation. The noise disturbs nearby residents every evening starting at 6:30 PM.",
        "action_requested": "Coordinate with the Department of Health or a wildlife specialist for safe relocation of the bat colony.",
        "category": "other",
    },
]

# ── Simple / terse reports (brief, less detail) ────────────────────
SIMPLE_REPORTS = [
    {"description": "Pothole on the road near 7-Eleven", "impact": "", "action_requested": "Fix it please"},
    {"description": "Broken streetlight", "impact": "Dark at night", "action_requested": ""},
    {"description": "May nagkalat ng basura sa kanto", "impact": "", "action_requested": "Pakilinis po"},
    {"description": "Damaged sidewalk in front of the school", "impact": "", "action_requested": ""},
    {"description": "Graffiti on the wall again", "impact": "Ugly", "action_requested": "Paint over it"},
    {"description": "Maingay na kapitbahay every night", "impact": "Can't sleep", "action_requested": "Sumbong sa barangay"},
    {"description": "Water leaking from the pipe on J.P. Rizal St.", "impact": "Sayang ang tubig", "action_requested": ""},
    {"description": "No traffic light at the intersection near the market", "impact": "Sobrang traffic", "action_requested": "Lagyan ng traffic light"},
    {"description": "Fallen tree branch blocking the sidewalk", "impact": "Can't pass through", "action_requested": "Remove it"},
    {"description": "Illegal parking on both sides of the street", "impact": "Cars can't pass", "action_requested": "Towing needed"},
    {"description": "Broken bench in the plaza", "impact": "", "action_requested": ""},
    {"description": "The public faucet is broken", "impact": "No water for residents", "action_requested": "Repair"},
    {"description": "Stray dogs near the school entrance", "impact": "Scary for kids", "action_requested": "Alagaan ng barangay"},
    {"description": "Truck parked on the sidewalk", "impact": "Pedestrians forced to walk on road", "action_requested": "Ticket the driver"},
    {"description": "Drainage clogged again", "impact": "Baha kapag umulan", "action_requested": "I-dredge"},
]

SEED_USER_EMAIL = "demo@comap.local"
SEED_USER_PASSWORD = "demo1234"


def _make_placeholder_photo():
    """Create a tiny valid PNG to satisfy the required photo field."""
    # Minimal 1x1 gray PNG
    png_bytes = bytes([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,  # PNG header
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,  # IHDR chunk
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
        0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,  # IDAT chunk
        0x54, 0x08, 0xD7, 0x63, 0x60, 0x60, 0x00, 0x00,
        0x00, 0x02, 0x00, 0x01, 0x4E, 0x8F, 0x6B, 0xF7,
        0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44,  # IEND chunk
        0xAE, 0x42, 0x60, 0x82,
    ])
    return ContentFile(png_bytes, name="placeholder.png")


class Command(BaseCommand):
    help = "Seed database with sample complaints for demo / dev"

    def add_arguments(self, parser):
        parser.add_argument('--count', type=int, default=30, help='Number of complaints to create')
        parser.add_argument('--clear', action='store_true', help='Remove existing seed data first')

    def handle(self, *args, **options):
        count = options['count']
        clear = options['clear']

        # ── Ensure test user exists ──────────────────────────────
        test_user, user_created = User.objects.get_or_create(
            username='demo_user',
            defaults={'email': SEED_USER_EMAIL},
        )
        if user_created:
            test_user.set_password(SEED_USER_PASSWORD)
            test_user.save()
            self.stdout.write(f"Created demo user: {SEED_USER_EMAIL} / {SEED_USER_PASSWORD}")

        # ── Optional clear ───────────────────────────────────────
        if clear:
            Complaint.objects.all().delete()
            self.stdout.write("Cleared all existing complaints.")

        # ── Complaint list ───────────────────────────────────────
        now = timezone.now()
        complaints = []

        for i in range(count):
            # Rotate between clear and simple reports
            if i % 3 < 2:  # 2/3 of reports are clear/detailed
                tmpl = random.choice(CLEAR_REPORTS)
                use_simple = False
            else:
                tmpl = random.choice(SIMPLE_REPORTS)
                use_simple = True

            loc_name, lat_delta, lng_delta = random.choice(LOCATIONS)
            lat = ANCHOR_LAT + lat_delta + random.uniform(-0.003, 0.003)
            lng = ANCHOR_LNG + lng_delta + random.uniform(-0.003, 0.003)
            category = tmpl["category"] if not use_simple else random.choice(CATEGORIES)
            status = random.choices(
                ['pending', 'approved', 'resolved'],
                weights=[50, 30, 20],
            )[0]

            # Stagger created_at so ordering looks natural
            age_hours = random.randint(1, 60 * 24 * 14)  # up to 14 days ago
            created = now - timedelta(hours=age_hours)
            updated = created + timedelta(hours=random.randint(1, 48))

            complaint = Complaint(
                latitude=round(lat, 6),
                longitude=round(lng, 6),
                description=tmpl["description"],
                impact=tmpl.get("impact", ""),
                action_requested=tmpl.get("action_requested", ""),
                category=category,
                status=status,
                user=test_user if random.random() < 0.4 else None,
                created_at=created,
                updated_at=updated,
            )
            if status == 'resolved':
                complaint.resolved_at = updated
            elif status == 'approved':
                complaint.acknowledged_at = updated - timedelta(hours=random.randint(1, 12))
            complaint.save()

            # Attach placeholder photo
            complaint.photo = _make_placeholder_photo()
            complaint.save(update_fields=['photo'])

            # ── Score (skip some complaints) ─────────────────────
            if random.random() < 0.75:
                dims = {
                    'specificity': random.randint(5, 30),
                    'context': random.randint(5, 25),
                    'clarity': random.randint(4, 20),
                    'completeness': random.randint(3, 15),
                    'actionability': random.randint(2, 10),
                }
                total = sum(min(v, m) for v, m in
                    [(dims['specificity'], 30), (dims['context'], 25),
                     (dims['clarity'], 20), (dims['completeness'], 15),
                     (dims['actionability'], 10)])

                if total >= 85:
                    grade = 'A'
                elif total >= 70:
                    grade = 'B'
                elif total >= 55:
                    grade = 'C'
                elif total >= 40:
                    grade = 'D'
                else:
                    grade = 'F'

                ReportScore.objects.create(
                    complaint=complaint, total=total, letter_grade=grade,
                    **dims
                )

            complaints.append(complaint)

        # ── A few upvotes across complaints ──────────────────────
        for c in random.sample(complaints, min(8, len(complaints))):
            Vote.objects.get_or_create(user=test_user, complaint=c)

        self.stdout.write(self.style.SUCCESS(
            f"Created {len(complaints)} complaints, "
            f"Resolved: {sum(1 for c in complaints if c.status == 'resolved')}, "
            f"Approved: {sum(1 for c in complaints if c.status == 'approved')}, "
            f"Pending: {sum(1 for c in complaints if c.status == 'pending')}"
        ))
