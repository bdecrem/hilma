#!/usr/bin/env python3
"""List the resource types in a classic Mac resource fork (read from a file's
named fork or a raw .rsrc file). Confirms an app has CODE/SIZE resources."""
import sys, struct

def read_rsrc(path):
    nf = path + "/..namedfork/rsrc"
    import os
    p = nf if os.path.exists(nf) else path
    return open(p, "rb").read()

b = read_rsrc(sys.argv[1])
dataOff, mapOff, dataLen, mapLen = struct.unpack(">IIII", b[:16])
m = b[mapOff:mapOff+mapLen]
typeListOff = struct.unpack(">H", m[24:26])[0]
tl = m[typeListOff:]
numTypes = struct.unpack(">h", tl[0:2])[0] + 1
print(f"resource fork: {len(b)} bytes, {numTypes} resource types")
off = 2
for i in range(numTypes):
    t = tl[off:off+4].decode("mac_roman")
    cnt = struct.unpack(">H", tl[off+4:off+6])[0] + 1
    print(f"  '{t}'  x{cnt}")
    off += 8
