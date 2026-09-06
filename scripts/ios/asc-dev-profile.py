#!/usr/bin/env python3
"""Mint (or refresh) an iOS development provisioning profile through the App Store
Connect API and install it for xcodebuild — for Macs with no Apple ID signed
into Xcode ("No Accounts").

  python3 scripts/ios/asc-dev-profile.py com.bartdecrem.Jambot "Jambot dev" 00008150-000038820EFB801C

Registers the bundle id if needed, picks the team's development certificate
that matches this Mac's keychain (Apple Development: Bart Decrem), includes the
given device UDID(s), writes the profile into
~/Library/Developer/Xcode/UserData/Provisioning Profiles/<UUID>.mobileprovision
and prints the PROVISIONING_PROFILE_SPECIFIER to use with CODE_SIGN_STYLE=Manual.

Key: ~/.appstoreconnect/private_keys/AuthKey_5A5HNSWA33.p8 (team key).
"""
import base64, json, os, plistlib, subprocess, sys, time, urllib.request
import jwt  # PyJWT

KEY_ID = '5A5HNSWA33'
ISSUER = '69a6de80-eb13-47e3-e053-5b8c7c11a4d1'
KEY_PATH = os.path.expanduser(f'~/.appstoreconnect/private_keys/AuthKey_{KEY_ID}.p8')
API = 'https://api.appstoreconnect.apple.com/v1'

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

def main():
    if len(sys.argv) < 4:
        raise SystemExit(__doc__)
    bundle, name, udids = sys.argv[1], sys.argv[2], sys.argv[3:]
    ids = call('GET', f'/bundleIds?filter[identifier]={bundle}')['data']
    ids = [b for b in ids if b['attributes']['identifier'] == bundle]
    if ids:
        bid = ids[0]['id']; print('bundle id exists', bid)
    else:
        bid = call('POST', '/bundleIds', {'data': {'type': 'bundleIds', 'attributes': {'identifier': bundle, 'name': name.split(' ')[0], 'platform': 'IOS'}}})['data']['id']
        print('registered bundle id', bid)
    # this Mac's development identity → its ASC certificate (match by serial)
    # every "Apple Development: Bart Decrem" cert in the keychain (there can be several; -a lists all)
    pems = subprocess.run(['security', 'find-certificate', '-a', '-c', 'Apple Development: Bart Decrem', '-p'], capture_output=True, text=True).stdout
    local = set()
    for block in pems.split('-----END CERTIFICATE-----'):
        if 'BEGIN CERTIFICATE' not in block: continue
        out = subprocess.run(['openssl', 'x509', '-noout', '-serial'], input=block + '-----END CERTIFICATE-----\n', capture_output=True, text=True).stdout
        if '=' in out: local.add(out.strip().split('=')[-1].lstrip('0').upper())
    certs = call('GET', '/certificates?filter[certificateType]=DEVELOPMENT&limit=200')['data']
    override = os.environ.get('ASC_CERT_ID')
    cert = next((c for c in certs if c['id'] == override), None) if override else None
    if not cert:
        cert = next((c for c in certs if c['attributes']['serialNumber'].lstrip('0').upper() in local), None)
    if not cert:
        raise SystemExit(f'no ASC development certificate matches this Mac (local serials {sorted(local)}); set ASC_CERT_ID=<id> from: ' + ', '.join(c['id'] + ':' + c['attributes']['serialNumber'] for c in certs))
    print('certificate', cert['id'], cert['attributes'].get('displayName') or cert['attributes'].get('name'))
    devs = call('GET', '/devices?filter[platform]=IOS&limit=200')['data']
    dev_ids = [d['id'] for d in devs if d['attributes']['udid'] in udids and d['attributes']['status'] == 'ENABLED']
    if not dev_ids:
        raise SystemExit('device(s) not registered in the team: ' + ', '.join(udids))
    print('devices', dev_ids)
    # replace an existing profile of the same name (profiles are immutable)
    for p in call('GET', f'/profiles?filter[name]={urllib.parse.quote(name)}')['data']:
        if p['attributes']['name'] == name:
            call('DELETE', f"/profiles/{p['id']}"); print('deleted old profile', p['id'])
    prof = call('POST', '/profiles', {'data': {'type': 'profiles', 'attributes': {'name': name, 'profileType': 'IOS_APP_DEVELOPMENT'},
        'relationships': {'bundleId': {'data': {'type': 'bundleIds', 'id': bid}},
                          'certificates': {'data': [{'type': 'certificates', 'id': cert['id']}]},
                          'devices': {'data': [{'type': 'devices', 'id': d} for d in dev_ids]}}}})['data']
    content = base64.b64decode(prof['attributes']['profileContent'])
    xml = subprocess.run(['security', 'cms', '-D'], input=content, capture_output=True).stdout
    uuid = plistlib.loads(xml)['UUID']
    dest = os.path.expanduser(f'~/Library/Developer/Xcode/UserData/Provisioning Profiles/{uuid}.mobileprovision')
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    open(dest, 'wb').write(content)
    print(f"installed {dest}\nexpires {prof['attributes']['expirationDate']}\nPROVISIONING_PROFILE_SPECIFIER={name}")

import urllib.parse
main()
