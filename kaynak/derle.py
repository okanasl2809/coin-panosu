# index.html'i şablondan üretir: python3 kaynak/derle.py
import os
d=os.path.dirname(os.path.abspath(__file__)); r=os.path.dirname(d)
t=open(os.path.join(d,'pano_sablon.html'),encoding='utf-8').read()
t=t.replace('__LISTS__',open(os.path.join(d,'lists.json'),encoding='utf-8').read()).replace('__V7__',open(os.path.join(r,'v7.js'),encoding='utf-8').read())
open(os.path.join(r,'index.html'),'w',encoding='utf-8').write(t)
