#!/usr/bin/env python3
"""Encode a native macOS file (with resource fork + Finder info) into a
MacBinary II stream, so hfsutils `hcopy -m` can write it into an HFS volume
with both forks and the type/creator codes intact.

Usage: macbin.py <source-file> <output.bin> [mac-name]
"""
import os, sys, struct, subprocess

def crc16(data):
    crc = 0
    for b in data:
        crc ^= b << 8
        for _ in range(8):
            crc = ((crc << 1) ^ 0x1021) & 0xFFFF if (crc & 0x8000) else (crc << 1) & 0xFFFF
    return crc

def main():
    src = sys.argv[1]
    out = sys.argv[2]
    name = sys.argv[3] if len(sys.argv) > 3 else os.path.basename(src)

    # data fork
    with open(src, 'rb') as f:
        data = f.read()

    # resource fork via the named-fork path
    rsrc = b''
    rsrc_path = src + '/..namedfork/rsrc'
    if os.path.exists(rsrc_path):
        with open(rsrc_path, 'rb') as f:
            rsrc = f.read()

    # FinderInfo xattr: 32 bytes (FInfo[16] + FXInfo[16])
    try:
        hexout = subprocess.check_output(
            ['xattr', '-px', 'com.apple.FinderInfo', src],
            stderr=subprocess.DEVNULL).decode()
        finfo = bytes.fromhex(hexout.replace(' ', '').replace('\n', ''))
    except subprocess.CalledProcessError:
        finfo = b'\x00' * 32
    if len(finfo) < 32:
        finfo = finfo + b'\x00' * (32 - len(finfo))

    ftype   = finfo[0:4]
    creator = finfo[4:8]
    flags_hi = finfo[8]          # Finder flags, high byte
    flags_lo = finfo[9]          # Finder flags, low byte
    location = finfo[10:14]      # point (v,h)
    folder   = finfo[14:16]

    nb = name.encode('mac_roman')[:63]

    hdr = bytearray(128)
    hdr[0] = 0                                   # old version byte
    hdr[1] = len(nb)                             # filename length
    hdr[2:2+len(nb)] = nb                        # filename
    hdr[65:69] = ftype                           # type
    hdr[69:73] = creator                         # creator
    hdr[73] = flags_hi                           # Finder flags high
    hdr[74] = 0
    hdr[75:79] = location                        # vert/horiz position
    hdr[79:81] = folder                          # window/folder id
    hdr[81] = 0                                  # protected
    hdr[82] = 0
    struct.pack_into('>I', hdr, 83, len(data))   # data fork length
    struct.pack_into('>I', hdr, 87, len(rsrc))   # resource fork length
    struct.pack_into('>I', hdr, 91, 0)           # creation date
    struct.pack_into('>I', hdr, 95, 0)           # modification date
    struct.pack_into('>H', hdr, 99, 0)           # get info comment length
    hdr[101] = flags_lo                          # Finder flags low (MacBinary II)
    struct.pack_into('>I', hdr, 116, 0)          # total unpacked length
    struct.pack_into('>H', hdr, 120, 0)          # secondary header length
    hdr[122] = 0x81                              # version written
    hdr[123] = 0x81                              # min version to read
    struct.pack_into('>H', hdr, 124, crc16(bytes(hdr[0:124])))  # CRC of 0..123

    def pad(b):
        r = len(b) % 128
        return b + (b'\x00' * (128 - r) if r else b'')

    with open(out, 'wb') as f:
        f.write(bytes(hdr))
        f.write(pad(data))
        f.write(pad(rsrc))

    print(f"{name}: data={len(data)} rsrc={len(rsrc)} type={ftype.decode('mac_roman')} creator={creator.decode('mac_roman')} -> {out}")

if __name__ == '__main__':
    main()
