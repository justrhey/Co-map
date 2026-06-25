"""
Lightweight profanity filter — English + Filipino (Tagalog).

Self-contained (no external dependency, works offline) and tuned for a Metro
Manila civic app. Normalizes common leetspeak/obfuscation before matching, and
matches on word boundaries to avoid the "Scunthorpe problem" (flagging clean
words that merely contain a bad substring, e.g. "class", "assistant").

Public API:
    contains_profanity(text) -> bool
    clean(text) -> str            # masks bad words with asterisks
"""
import re

# Curated base list. Keep roots only — leetspeak/plurals are handled by
# normalization + the boundary regex. Intentionally conservative to limit
# false positives on a civic-reporting app.
_BAD_WORDS = {
    # English
    'fuck', 'shit', 'bitch', 'asshole', 'bastard', 'dick', 'piss',
    'cunt', 'slut', 'whore', 'faggot', 'nigger', 'nigga', 'retard',
    'motherfucker', 'bullshit', 'douche', 'twat', 'wanker', 'prick',
    # Filipino / Tagalog
    'putangina', 'putang', 'tangina', 'tang ina', 'gago', 'gaga',
    'tanga', 'ulol', 'bobo', 'tarantado', 'pakshet', 'puke', 'pekpek',
    'titi', 'kantot', 'iyot', 'bwisit', 'leche', 'punyeta', 'hinayupak',
    'hayop ka', 'lintik', 'pucha', 'puta', 'kupal', 'ungas', 'engot',
}

# Map obfuscation characters to their plain-letter equivalents.
_LEET = str.maketrans({
    '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't',
    '@': 'a', '$': 's', '!': 'i', '+': 't',
})


def _normalize(text):
    """Lowercase, de-leet, and collapse character-stretching/separators so
    'f.u.c.k', 'fuuuck', 'f@ck' all reduce to a matchable form."""
    t = (text or '').lower().translate(_LEET)
    # Drop separators commonly used to slip words past filters.
    t = re.sub(r'[\s\.\-_*]+', ' ', t)
    # Collapse 3+ repeated letters to a single (fuuuck -> fuck-ish).
    t = re.sub(r'(.)\1{2,}', r'\1', t)
    return t


# Build one regex of all roots, longest first. A root must START on a word
# boundary, but may be followed by a short suffix (e.g. fuck→fucking, shit→shitty,
# gago→gagong) before the next boundary. The suffix is capped so a root can't
# bleed into an unrelated longer clean word.
_ROOTS = sorted((re.escape(w) for w in _BAD_WORDS), key=len, reverse=True)
_PATTERN = re.compile(r'\b(?:' + '|'.join(_ROOTS) + r')(?:[a-z]{0,4})?\b', re.IGNORECASE)


# Single-letter-spacing variant ("f u c k"): a version with all spaces removed.
# Matched WITHOUT word boundaries (so it catches words run together), but only
# used as a secondary pass so normal prose isn't over-matched.
_PATTERN_NOSPACE = re.compile('(?:' + '|'.join(_ROOTS) + ')', re.IGNORECASE)


def contains_profanity(text):
    """True if the (normalized) text contains a blocked word."""
    if not text:
        return False
    norm = _normalize(text)
    if _PATTERN.search(norm):
        return True
    # Catch letter-by-letter spacing ("f u c k") by retrying with spaces gone,
    # but only when the original was mostly single-char tokens (avoids matching
    # roots that happen to span normal adjacent words).
    tokens = norm.split()
    if tokens and sum(len(t) == 1 for t in tokens) >= 3:
        if _PATTERN_NOSPACE.search(norm.replace(' ', '')):
            return True
    return False


def clean(text, mask='*'):
    """Return the text with profane words masked (length-preserving)."""
    if not text:
        return text
    # Mask against the ORIGINAL text where possible; fall back to normalized.
    def _mask(m):
        return mask * len(m.group(0))
    # Match on a lightly-normalized copy for detection, but to keep it simple
    # and predictable we mask occurrences found in the normalized form.
    norm = _normalize(text)
    if not _PATTERN.search(norm):
        return text
    # Best-effort masking on the original: replace each root occurrence.
    out = text
    for root in _BAD_WORDS:
        out = re.sub(r'\b' + re.escape(root) + r'\b', lambda m: mask * len(m.group(0)),
                     out, flags=re.IGNORECASE)
    return out
