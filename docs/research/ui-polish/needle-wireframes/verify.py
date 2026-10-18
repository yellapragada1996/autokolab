"""Content and static artifact checks. Browser layout is checked separately by look.mjs."""
from pathlib import Path
from bs4 import BeautifulSoup
import json,re,base64
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
# The single HTML has no external runtime resources, including the font.
assert not soup.select('script[src],link[rel=stylesheet]')
for el in soup.select('[src]'):
    url=el['src']
    assert url.startswith('data:'), url
    assert base64.b64decode(url.split(',',1)[1])==(P/el['data-asset']).read_bytes()
assert 'data:font/ttf;base64,' in soup.get_text() or 'data:font/ttf;base64,' in str(soup)
assert len(soup.select('style[data-source]'))==4
for a in soup.select('a[href^="#"]'):
    assert a['href'][1:] in ids,a['href']
def controls(root):
    return [(x.name,x.get('aria-label'),x.get('placeholder'),x.get('value'),x.get('disabled') is not None,x.get('checked') is not None,x.get_text(' ',strip=True)) for x in root.select('button,input,textarea,select')]

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
    for hint in original.select('kbd'): hint.decompose()
    assert main.get_text(' ',strip=True)==original.get_text(' ',strip=True),key+' current source text'
    assert controls(main)==controls(original),key+' controls'
    assert len(main.select('table'))==len(original.select('table')),key+' tables'
    assert frame.select_one('.need-count').get_text(strip=True)==BeautifulSoup(snapshots[sourcekey],'html.parser').select_one('.ak-shell-need').get_text(strip=True)
# The only omission from the real dialog is the forbidden shortcut hint.
shared=json.loads((P/'shared-snapshots.json').read_text())
original_dialog=BeautifulSoup(shared['dialog'],'html.parser').select_one('[role=dialog]')
for text in original_dialog.find_all(string=re.compile('⌘ Enter')): text.parent.decompose()
for dialog in soup.select('.source-dialog'):
    assert dialog.get_text(' ',strip=True)==original_dialog.get_text(' ',strip=True)
    assert controls(dialog)==controls(original_dialog)
for frame in soup.select('[data-frame^=overview-]'):
    header=frame.select_one('.overview-shell-head')
    original_header=BeautifulSoup(shared['overview'],'html.parser').find('header')
    original_header.find('strong').string='Northstar Shop'
    assert header.get_text(' ',strip=True)==original_header.get_text(' ',strip=True)
    assert controls(header)==controls(original_header)
# All product frame controls have source evidence. Appearance is the only new control.
for frame in frames:
    assert len(frame.select('[data-theme-choice]'))==3
    assert not frame.select('kbd,[aria-keyshortcuts],.shortcut,.command')
    assert not any('⌘' in e.get('title','') or 'G then' in e.get('title','') for e in frame.find_all(True))
assert not soup.find('input',attrs={'aria-label':'Command'})
assert '⌘' not in soup.get_text()
assert 'CommandPalette' not in soup.get_text()
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
print('Passed: 36 frames; nine tabs each; exact current tab text/controls/tables; exact v5 structure; actual Overview top bar and New ticket dialog; embedded resources; no command entry or shortcut hints; IDs/links; tokens; type; reduced motion; contrast.')
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

needle=(P/'gallery.css').read_text()
assert '--rail-width:168px;--rail-medium:168px' in tokens
assert '--height-nav:48px' in tokens
assert '--duration-hover:120ms;--duration-overlay:140ms' in tokens
assert '.shell-pages a[aria-current=page]::before' in needle and 'right:-1px' in needle
assert 'grid-template-columns:repeat(3,minmax(0,1fr))' in needle
assert '.phone .overview-shell-head{display:flex' in needle
assert 'animation:presence' not in css
# Ensure generated HTML embeds exactly the source styles (font URL aside) and runtime script.
for style in soup.select('style[data-source]'):
    emitted=style.string
    expected_css=(P/style['data-source']).read_text()
    if style['data-source']=='tokens.css':
        font='data:font/ttf;base64,'+base64.b64encode((P/'geist-latin.ttf').read_bytes()).decode()
        expected_css=expected_css.replace("url('./geist-latin.ttf')", 'url("'+font+'")')
    assert emitted==expected_css
assert soup.find('script').string==(P/'gallery.js').read_text()
print('Passed: Needle 168px rail, 48px rows, right marker, permanent phone grid, <150ms transitions and single-file embedding.')
