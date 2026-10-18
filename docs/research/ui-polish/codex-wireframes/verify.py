"""Content and static artifact checks. Browser layout is checked separately by look.mjs."""
from pathlib import Path
from bs4 import BeautifulSoup
import json,re
P=Path(__file__).resolve().parent
soup=BeautifulSoup((P/'index.html').read_text(),'html.parser')
expected=json.loads((P/'content-manifest.json').read_text())
snapshots=json.loads((P/'snapshots.json').read_text())
frames=soup.select('.device')
assert len(frames)==36, len(frames)
ids=[x['id'] for x in soup.select('[id]')]
assert len(ids)==len(set(ids)), 'Duplicate IDs'
for el in soup.select('[aria-controls]'):
    assert el['aria-controls'] in ids,el['aria-controls']
for el in soup.select('[src],link[href]'):
    url=el.get('src',el.get('href'))
    assert not url.startswith(('http:','https:','/')), url
    assert (P/url).exists(),url
for a in soup.select('a[href^="#"]'):
    assert a['href'][1:] in ids,a['href']
labels=['Captain','Overview','Work','Team','Room','Decisions','Results','Settings','Guide']
for frame in frames:
    nav=frame.select_one('.shell-pages')
    assert len(nav.select('a'))==9
    assert [a.contents[0] for a in nav.select('a')]==labels
    assert not nav.select('details,button,select')
    key,width=frame['data-frame'].rsplit('-',1)
    if width=='320': continue
    if key=='overview':
        reference=BeautifulSoup(json.loads((P/'overview-snapshots.json').read_text())['overview'],'html.parser')
        assert frame.select_one('.overview').get_text(' ',strip=True)==reference.get_text(' ',strip=True)
        # Preserve section order, all descendants, class semantics and progress lengths.
        ours=frame.select_one('.overview')
        theirs=reference.select_one('.overview')
        assert [(e.name,e.get('class')) for e in ours.find_all(True)]==[(e.name,e.get('class')) for e in theirs.find_all(True)]
        continue
    sourcekey='captain' if key=='shell' else key
    main=frame.select_one('main')
    assert main.get_text(' ',strip=True)==expected[sourcekey],key+' text'
    original=BeautifulSoup(snapshots[sourcekey],'html.parser').find('main')
    def controls(root):
        return [(x.name,x.get('aria-label'),x.get('placeholder'),x.get('value'),x.get('disabled') is not None,x.get('checked') is not None,x.get_text(' ',strip=True)) for x in root.select('button,input,textarea,select')]
    assert controls(main)==controls(original),key+' controls'
    assert len(main.select('table'))==len(original.select('table')),key+' tables'
    assert frame.select_one('.need-count').get_text(strip=True)==BeautifulSoup(snapshots[sourcekey],'html.parser').select_one('.ak-shell-need').get_text(strip=True)
css='\n'.join((P/f).read_text() for f in ['gallery.css','overview.css','snapshot-styles.css'])
assert not re.search(r'#[\da-fA-F]{3,8}\b|rgba?\(|gradient\(',css),'Colours outside tokens or gradients'
assert 'prefers-reduced-motion' in css
for style in re.findall(r'font-size:([^;}]+)',css):
    if re.fullmatch(r'\d+px',style): assert int(style[:-2])>=12,style
# Every CSS var reference is defined, including values used only by the approved Overview.
all_css=css+(P/'tokens.css').read_text()
defined=set(re.findall(r'(--[\w-]+)\s*:',all_css))
used=set(re.findall(r'var\((--[\w-]+)',all_css))
# --phase and --pointer have explicit local fallbacks in v5.
assert used-defined <= {'--phase','--pointer'},used-defined
for item in json.loads((P/'contrast.json').read_text()):
    assert item['ratio']>=item['minimum']
for asset in ['autokolab-logo.svg','autokolab-croc.svg','autokolab-wordmark.svg']:
    assert (P/asset).read_bytes()==(P.parents[3]/'apps/site/public/brand'/asset).read_bytes()
assert not any(x.name.startswith('.snapshot-render') for x in P.iterdir())
print('Passed: 36 frames; nine visible tabs each; exact tab text/control/table preservation; exact v5 structure; local assets; IDs/links; named colours; type minimum; reduced motion; contrast rows.')
print('This is a source and markup audit, not browser or accessibility certification.')

# Audit the foreground/background pairs actually emitted from app styles, too.
tokens=(P/'tokens.css').read_text()
parse=lambda text:dict(re.findall(r'(--[\w-]+):([^;{}]+);',text))
aliases=parse(tokens.split('/* Resolve aliases')[1])
dark=parse(tokens.split(":root,[data-theme='dark']{")[1].split("[data-theme='light']{")[0])
light=parse(tokens.split("[data-theme='light']{")[1].split('/* Resolve aliases')[0])
def colour(theme,value):
    return colour(theme,theme[value[4:-1]]) if value.startswith('var(') else value
def luminance(value):
    channels=[int(value[i:i+2],16)/255 for i in [1,3,5]]
    channels=[c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4 for c in channels]
    return sum(a*b for a,b in zip(channels,[.2126,.7152,.0722]))
checked=0
for cls,body in re.findall(r'\.(s\d+)\{([^}]*)\}',(P/'snapshot-styles.css').read_text()):
    declarations=dict(x.split(':',1) for x in body.split(';') if ':' in x)
    fg,bg=declarations.get('color',''),declarations.get('background','')
    if fg.startswith('var(') and bg.startswith('var('):
        for name,palette in [('dark',dark),('light',light)]:
            theme={**palette,**aliases}
            lo,hi=sorted([luminance(colour(theme,fg)),luminance(colour(theme,bg))])
            ratio=(hi+.05)/(lo+.05)
            assert ratio>=4.5,(cls,name,ratio)
            checked+=1
print(f'Passed: {checked} explicit text/background pairs in generated app presentation rules.')
