# qraudio (Python)

Reference encoder/decoder for QRAudio snippets.

```python
from qraudio import decode, encode, scan
```

WAV helpers are also available:

```python
from qraudio import encodeWav, decodeWav, scanWav, prependPayloadToWav
```

Profiles are exposed as an enum:

```python
from qraudio import ProfileName

encode({"url": "https://example.com"}, profile=ProfileName.AFSK_FIFTH)
```
