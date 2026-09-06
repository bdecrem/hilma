#!/usr/bin/env python3
"""Mint (or refresh) a provisioning profile of any type through the App Store
Connect API and install it for xcodebuild — for Macs with no Apple ID signed
into Xcode ("No Accounts"). Generalises asc-dev-profile.py (which stays as-is
for the development flow the app docs already reference).

  python3 scripts/ios/asc-profile.py <bundle-id> "<profile name>" <kind> [device UDID ...]

  kind:  dev                → IOS_APP_DEVELOPMENT   (needs ≥1 device UDID; DEVELOPMENT cert)
         appstore           → IOS_APP_STORE         (DISTRIBUTION cert)
         catalyst-appstore  → MAC_CATALYST_APP_STORE (DISTRIBUTION cert)
         catalyst-dev       → MAC_CATALYST_APP_DEVELOPMENT (needs ≥1 Mac UDID; DEVELOPMENT cert)

  python3 scripts/ios/asc-profile.py com.bartdecrem.Jambot "Jambot appstore" appstore
  python3 scripts/ios/asc-profile.py com.bartdecrem.Jambot "Jambot catalyst appstore" catalyst-appstore
  python3 scripts/ios/asc-profile.py com.bartdecrem.Jambot "Jambot dev" dev 00008150-000038820EFB801C

Registers the bundle id if needed, picks the team certificate of the right
type whose serial matches a certificate in this Mac's keychain ("Apple
Distribution: Bart Decrem" / "Apple Development: Bart Decrem" — override with
ASC_CERT_ID=<id>), deletes any existing profile of the same name (profiles
are immutable), writes the new one into
~/Library/Developer/Xcode/UserData/Provisioning Profiles/<UUID>.mobileprovision
(.provisionprofile for Catalyst) and prints the PROVISIONING_PROFILE_SPECIFIER
to use with CODE_SIGN_STYLE=Manual.

Key: ~/.appstoreconnect/private_keys/AuthKey_5A5HNSWA33.p8 (team key).
"""
import base64, json, os, plistlib, subprocess, sys, time, urllib.parse, urllib.request
import jwt  # PyJWT

KEY_ID = '5A5HNSWA33'
ISSUER = '69a6de80-eb13-47e3-e053-5b8c7c11a4d1'
KEY_PATH = os.path.expanduser(f'~/.appstoreconnect/private_keys/AuthKey_{KEY_ID}.p8')
API = 'https://api.appstoreconnect.apple.com/v1'

KINDS = {
    # kind: (profileType, certificateType, keychain common name, needs devices, device platform, file extension)
    'dev':               ('IOS_APP_DEVELOPMENT',          'DEVELOPMENT',  'Apple Development: Bart Decrem',  True,  'IOS',    'mobileprovision'),
    'appstore':          ('IOS_APP_STORE',                'DISTRIBUTION', 'Apple Distribution: Bart Decrem', False, None,     'mobileprovision'),
    'catalyst-appstore': ('MAC_CATALYST_APP_STORE',       'DISTRIBUTION', 'Apple Distribution: Bart Decrem', False, None,     'provisionprofile'),
    'catalyst-dev':      ('MAC_CATALYST_APP_DEVELOPMENT', 'DEVELOPMENT',  'Apple Development: Bart Decrem',  True,  'MAC_OS', 'provisionprofile'),
}

def token():
    now = int(time.time())
    return jwt.encode({'iss': ISSUER, 'iat': now, 'exp': now + 1200, 'aud': 'appstoreconnect-v1'},
                      open(KEY_PATH).read(), algorithm='ES256', headers={'kid': KEY_ID})

def call(method, path, body=None):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body else None,
                                 headers={'Authorization': f'Bearer {token()}', 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req) as r:
            return json.load(r) if r.status != 204 else {}
    except urllib.error.HTTPError as e:
        raise SystemExit(f'{method} {path} → {e.code}: {e.read().decode()[:600]}')

def local_serials(common_name):
    """Serials of every keychain certificate with this common name (there can be several)."""
    pems = subprocess.run(['security', 'find-certificate', '-a', '-c', common_name, '-p'], capture_output=True, text=True).stdout
    found = set()
    for block in pems.split('-----END CERTIFICATE-----'):
        if 'BEGIN CERTIFICATE' not in block: continue
        out = subprocess.run(['openssl', 'x509', '-noout', '-serial'], input=block + '-----END CERTIFICATE-----\n', capture_output=True, text=True).stdout
        if '=' in out: found.add(out.strip().split('=')[-1].lstrip('0').upper())
    return found

def main():
    if len(sys.argv) < 4 or sys.argv[3] not in KINDS:
        raise SystemExit(__doc__)
    bundle, name, kind, udids = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4:]
    profile_type, cert_type, common_name, needs_devices, device_platform, ext = KINDS[kind]
    if needs_devices and not udids:
        raise SystemExit(f'{kind} profiles need at least one device UDID')

    ids = [b for b in call('GET', f'/bundleIds?filter[identifier]={bundle}')['data'] if b['attributes']['identifier'] == bundle]
    if ids:
        bid = ids[0]['id']; print('bundle id exists', bid)
    else:
        bid = call('POST', '/bundleIds', {'data': {'type': 'bundleIds', 'attributes': {'identifier': bundle, 'name': name.split(' ')[0], 'platform': 'IOS'}}})['data']['id']
        print('registered bundle id', bid)

    local = local_serials(common_name)
    certs = call('GET', f'/certificates?filter[certificateType]={cert_type}&limit=200')['data']
    override = os.environ.get('ASC_CERT_ID')
    cert = next((c for c in certs if c['id'] == override), None) if override else None
    if not cert:
        cert = next((c for c in certs if c['attributes']['serialNumber'].lstrip('0').upper() in local), None)
    if not cert:
        raise SystemExit(f'no ASC {cert_type} certificate matches this Mac (local serials {sorted(local)}); set ASC_CERT_ID=<id> from: '
                         + ', '.join(c['id'] + ':' + c['attributes']['serialNumber'] for c in certs))
    print('certificate', cert['id'], cert_type, cert['attributes'].get('displayName') or cert['attributes'].get('name'), 'expires', cert['attributes']['expirationDate'][:10])

    relationships = {'bundleId': {'data': {'type': 'bundleIds', 'id': bid}},
                     'certificates': {'data': [{'type': 'certificates', 'id': cert['id']}]}}
    if needs_devices:
        devs = call('GET', f'/devices?filter[platform]={device_platform}&limit=200')['data']
        dev_ids = [d['id'] for d in devs if d['attributes']['udid'] in udids and d['attributes']['status'] == 'ENABLED']
        if not dev_ids:
            raise SystemExit('device(s) not registered in the team: ' + ', '.join(udids))
        print('devices', dev_ids)
        relationships['devices'] = {'data': [{'type': 'devices', 'id': d} for d in dev_ids]}

    for p in call('GET', f'/profiles?filter[name]={urllib.parse.quote(name)}')['data']:
        if p['attributes']['name'] == name:
            call('DELETE', f"/profiles/{p['id']}"); print('deleted old profile', p['id'])
    prof = call('POST', '/profiles', {'data': {'type': 'profiles', 'attributes': {'name': name, 'profileType': profile_type},
                                              'relationships': relationships}})['data']
    content = base64.b64decode(prof['attributes']['profileContent'])
    xml = subprocess.run(['security', 'cms', '-D'], input=content, capture_output=True).stdout
    uuid = plistlib.loads(xml)['UUID']
    dest = os.path.expanduser(f'~/Library/Developer/Xcode/UserData/Provisioning Profiles/{uuid}.{ext}')
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    open(dest, 'wb').write(content)
    print(f"profile {prof['id']} {profile_type} uuid {uuid}\ninstalled {dest}\nexpires {prof['attributes']['expirationDate']}\nPROVISIONING_PROFILE_SPECIFIER={name}")

main()
