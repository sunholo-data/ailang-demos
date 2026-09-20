"""Presentation-only OpenRouter artwork transport; world semantics stay in AILANG."""
import base64
import binascii
import json
from urllib.request import Request, urlopen

MODEL = 'black-forest-labs/flux.2-klein-4b'
ESTIMATED_COST = 0.014
MAX_RESPONSE_BYTES = 8 * 1024 * 1024


def generate(description, key):
    prompt = (
        'Create one small game inventory illustration for a gentle woodland creature game. '
        'Single isolated object, chunky readable silhouette, softly shaded clay-like 3D style, '
        'three-quarter overhead view, muted natural colours. Centre the entire object with '
        'generous empty margins on a perfectly flat pale green background (#f1f5ed). '
        'No scenery, ground plane, text, lettering, border or watermark. '
        'Depict this item: ' + description
    )
    request = Request('https://openrouter.ai/api/v1/images',
                      data=json.dumps({'model': MODEL, 'prompt': prompt,
                                       'aspect_ratio': '1:1', 'output_format': 'png', 'n': 1}).encode(),
                      headers={'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'},
                      method='POST')
    with urlopen(request, timeout=60) as response:
        body = response.read(MAX_RESPONSE_BYTES + 1)
    if len(body) > MAX_RESPONSE_BYTES:
        raise ValueError('Artwork response is too large')
    return json.loads(body)


def image_data(result):
    """Accept bounded raster data only, never an arbitrary remote URL or SVG."""
    image = result['data'][0]
    media_type = image.get('media_type', 'image/png')
    encoded = image['b64_json']
    if media_type not in {'image/png', 'image/jpeg', 'image/webp'} or not isinstance(encoded, str):
        raise ValueError('Unsupported artwork format')
    try:
        raw = base64.b64decode(encoded, validate=True)
    except binascii.Error as error:
        raise ValueError('Invalid image data') from error
    signatures = {'image/png': raw.startswith(b'\x89PNG\r\n\x1a\n'),
                  'image/jpeg': raw.startswith(b'\xff\xd8\xff'),
                  'image/webp': raw.startswith(b'RIFF') and raw[8:12] == b'WEBP'}
    if not signatures[media_type] or len(raw) > 5 * 1024 * 1024:
        raise ValueError('Invalid artwork bytes')
    return 'data:' + media_type + ';base64,' + encoded
