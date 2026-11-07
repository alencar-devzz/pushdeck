# Gera os icones do launcher do Android a partir de icons/icon-512.png
import os, glob
from PIL import Image
src = Image.open('icons/icon-512.png').convert('RGBA')
sizes = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
res = 'android/app/src/main/res'
for d in glob.glob(res + '/mipmap-anydpi*'):          # remove icone adaptativo padrao do Capacitor
    for f in glob.glob(d + '/*'): os.remove(f)
    os.rmdir(d)
for dens, px in sizes.items():
    d = f'{res}/mipmap-{dens}'
    os.makedirs(d, exist_ok=True)
    im = src.resize((px, px), Image.LANCZOS)
    for n in ('ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png'):
        im.save(f'{d}/{n}')
