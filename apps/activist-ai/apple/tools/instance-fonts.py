import os, sys
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

os.chdir(sys.argv[1])
specs = [
    ('BricolageGrotesque.ttf', {'opsz': 14, 'wght': 400, 'wdth': 100}, 'Ola Sans', 'Regular', 'OlaSans-Regular'),
    ('BricolageGrotesque.ttf', {'opsz': 14, 'wght': 500, 'wdth': 100}, 'Ola Sans', 'Medium', 'OlaSans-Medium'),
    ('BricolageGrotesque.ttf', {'opsz': 14, 'wght': 650, 'wdth': 100}, 'Ola Sans', 'Semibold', 'OlaSans-Semibold'),
    ('BricolageGrotesque.ttf', {'opsz': 28, 'wght': 720, 'wdth': 100}, 'Ola Sans', 'Display', 'OlaSans-Display'),
    ('Literata.ttf', {'opsz': 14, 'wght': 400}, 'Ola Serif', 'Regular', 'OlaSerif-Regular'),
    ('Literata.ttf', {'opsz': 14, 'wght': 640}, 'Ola Serif', 'Semibold', 'OlaSerif-Semibold'),
    ('Literata.ttf', {'opsz': 24, 'wght': 700}, 'Ola Serif', 'Heading', 'OlaSerif-Heading'),
    ('Literata-Italic.ttf', {'opsz': 14, 'wght': 400}, 'Ola Serif', 'Italic', 'OlaSerif-Italic'),
]
for src, loc, fam, style, ps in specs:
    inst = instancer.instantiateVariableFont(TTFont(src), loc)
    n = inst['name']
    for nid in (1, 2, 3, 4, 6, 16, 17, 21, 22, 25):
        n.removeNames(nameID=nid)
    n.setName(f'{fam} {style}', 1, 3, 1, 0x409)
    n.setName('Regular', 2, 3, 1, 0x409)
    n.setName(f'{ps};ola', 3, 3, 1, 0x409)
    n.setName(f'{fam} {style}', 4, 3, 1, 0x409)
    n.setName(ps, 6, 3, 1, 0x409)
    if 'STAT' in inst:
        del inst['STAT']
    inst.save(f'{ps}.ttf')
    print(ps, os.path.getsize(f'{ps}.ttf'))
for f in ('BricolageGrotesque.ttf', 'Literata.ttf', 'Literata-Italic.ttf'):
    os.remove(f)
