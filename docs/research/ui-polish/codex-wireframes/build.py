"""Build static HTML from the frozen React demo snapshots. No application file is written."""
from pathlib import Path
from bs4 import BeautifulSoup
import json, re, html
HERE = Path(__file__).resolve().parent
SNAPSHOTS = json.loads((HERE / 'snapshots.json').read_text())
OVERVIEW = json.loads((HERE / 'overview-snapshots.json').read_text())
STYLES = {}
TOKENS = (HERE / 'tokens.css').read_text()
DARK = dict(re.findall(r'(--[\w-]+):([^;{}]+);', TOKENS.split(":root,[data-theme='dark']{")[1].split("[data-theme='light']{")[0]))
LIGHT = dict(re.findall(r'(--[\w-]+):([^;{}]+);', TOKENS.split("[data-theme='light']{")[1].split('/* Resolve aliases')[0]))
def resolve(theme, token):
    value = theme[token].strip()
    return resolve(theme, value[4:-1]) if value.startswith('var(') else value

def luminance(hexcode):
    channels = [int(hexcode[i:i+2], 16)/255 for i in (1,3,5)]
    c = [v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4 for v in channels]
    return sum(a*b for a,b in zip(c,[.2126,.7152,.0722]))

def contrast(theme, fg, bg):
    a,b = sorted([luminance(resolve(theme,fg)), luminance(resolve(theme,bg))])
    return (b+.05)/(a+.05)

REPORT=[]
def ratio_rows(theme, name):
    rows=[]
    pairs=[('Primary / page','--text-primary','--page',4.5),('Reading / card','--text-reading','--card',7),('Supporting / page','--text-support','--page',4.5),('Muted / card','--text-quiet','--card',4.5),('Muted / selected','--text-quiet','--selected-fill',4.5),('Button text / fill','--action-text','--action-fill',4.5)]
    pairs += [(word+' / status fill',f'--{role}-text',f'--{role}-fill',4.5) for role,word in [('needs','Needs you'),('done','Done / safe'),('live','Live / moving'),('failure','Failure / heads-up')]]
    pairs += [('Field edge / inset','--control-edge','--inset',3),('Field edge / selected','--control-edge','--selected-fill',3),('Focus / floating','--focus-ring','--floating',3)]
    for label,fg,bg,target in pairs:
        value=contrast(theme,fg,bg)
        assert value>=target, (name,label,value,target)
        REPORT.append(dict(theme=name,label=label,foreground=resolve(theme,fg),background=resolve(theme,bg),ratio=round(value,2),minimum=target))
        rows.append(f'<tr><td>{label}</td><td>{value:.2f}:1 · pass</td></tr>')
    return ''.join(rows)

TABS=['Captain','Overview','Work','Team','Room','Decisions','Results','Settings','Guide']
def shell(active, prefix, overview=False, opened=False, key="captain"):
    project,account,count=('Northstar Shop','Raghav','1') if overview else ('Shop','Ana',BeautifulSoup(SNAPSHOTS['captain' if key=='shell' else key],'html.parser').select_one('.ak-shell-need').get_text(strip=True))
    links=''.join(f'<a href="#{label.lower()}" '+('aria-current="page" ' if label==active else '')+f'>{label}'+(f'<span class="need-count" aria-label="{count} need you"><i class="mark" aria-hidden="true"></i>{count}</span>' if label=='Captain' else '')+'</a>' for label in TABS)
    return f'''<aside class="shell-rail"><a class="brand-link" href="#shell" aria-label="AutoKolab shell"><img src="autokolab-logo.svg" alt="AutoKolab" width="126" height="36"></a>
    <details class="project-switch" {'open' if opened else ''}><summary aria-label="Switch project">{project}<span aria-hidden="true">⌄</span></summary><div class="menu"><a href="#overview">{project}<span aria-hidden="true">✓</span></a><a href="#shell">+ New project</a></div></details>
    <nav class="shell-pages" aria-label="Pages">{links}</nav><div class="account"><a class="account-person" href="#shell-states" aria-label="Change your name"><span class="avatar person">{account[0]}</span>{account}</a><button class="signout" type="button">Sign out</button><div class="appearance" role="group" aria-label="Appearance">{''.join(f'<button type="button" data-theme-choice="{t.lower()}" aria-pressed="{str(t=="System").lower()}">{t}</button>' for t in ['System','Light','Dark'])}</div></div></aside>'''

def nav_destination(href):
    if '/work/' in href or '/t/' in href: return '#ticket'
    if '/plans/' in href or '/look/' in href: return '#captain'
    for path,target in [('/overview','overview'),('/work','work'),('/people','team'),('/room','room'),('/guide','guide'),('tab=guide','guide'),('/decisions','decisions'),('/settings','settings'),('/results','results'),('/connect','team')]:
        if path in href: return '#'+target
    return '#captain'

FONT={12:'meta',13:'label',14:'row',15:'reading',16:'input',17:'section',18:'section',19:'card',20:'card',21:'card',22:'title-phone',24:'title',26:'title',28:'title',30:'card',32:'card',34:'card',38:'card',40:'card'}
SPACE={4:1,8:2,12:3,16:4,20:5,24:6,32:8,40:10,48:12,56:14}
def normal_style(style):
    out=[]
    for decl in style.split(';'):
        if ':' not in decl: continue
        prop,value=decl.split(':',1)
        if prop=='font-size' and re.fullmatch(r'\d+px',value):
            n=int(value[:-2]); value='var(--type-'+FONT.get(n,'meta' if n<12 else 'row')+')'
        elif prop=='font':
            value=re.sub(r'(\d+)px',lambda m:'var(--type-'+FONT.get(int(m[1]),'meta')+')',value)
        elif prop in ['gap','row-gap','column-gap','padding','margin','padding-top','padding-bottom','padding-left','padding-right','margin-top','margin-bottom','margin-left','margin-right']:
            value=re.sub(r'(?<![\w.-])(\d+)px',lambda m:'var(--space-'+str(SPACE[int(m[1])])+')' if int(m[1]) in SPACE else m[0],value)
        elif prop=='border-radius' and re.fullmatch(r'\d+px',value):
            n=int(value[:-2]); value='var(--radius-'+('pill' if n>=100 else 'dialog' if n>=20 else 'card' if n>=12 else 'control')+')'
        elif prop=='opacity' and value not in ['0','1']:
            value='1'
        value=value.replace('60vw','100%')
        out.append(f'{prop}:{value}')

    font = next((v.split(':',1)[1] for v in out if v.startswith('font-size:var(--type-')),None)
    if font:
        role=font[len('var(--type-'):-1]
        out=[v for v in out if not v.startswith('line-height:')]
        out.append('line-height:var(--leading-'+role+')')
    return ';'.join(out)

# Record the exact source strings before changing appearance or gallery destinations.
CONTENT_FINGERPRINTS={}
def app_content(key,prefix):
    soup=BeautifulSoup(SNAPSHOTS[key],'html.parser')
    main=soup.find('main')
    CONTENT_FINGERPRINTS[key]=main.get_text(' ',strip=True)
    main['class']=['screen','tab-'+key]
    main.attrs.pop('style',None)
    header=main.find('header',recursive=False)
    header['class']=['page-title'];header.attrs.pop('style',None)
    content=main.find('div',recursive=False)
    content['class']=['content'];content.attrs.pop('style',None)
    # Keep each existing scroll region local to its content frame.
    for table in main.find_all('table'):
        wrap=soup.new_tag('div',attrs={'class':'table-scroll','tabindex':'0','aria-label':'Table, scroll horizontally on small screens'})
        table.wrap(wrap)
    if key=='room':
        for el in main.find_all(style=True):
            if 'max-height:calc(100vh - 150px)' in el['style']: el['class']=el.get('class',[])+['room-panel']
            if 'overflow-y:auto' in el['style']: el['class']=el.get('class',[])+['room-messages']
    for el in main.find_all(True):
        if 'id' in el.attrs: el['id']=prefix+'-'+el['id']
        for attr in ['for','aria-controls','aria-describedby','aria-labelledby']:
            if attr in el.attrs: el[attr]=' '.join(prefix+'-'+s for s in el[attr].split())
        if el.name=='a' and el.get('href'):
            old=el['href'];el['data-app-href']=old;el['href']=nav_destination(old)
        if el.get('src','').startswith('/brand/'): el['src']=el['src'].split('/')[-1]
        if 'autofocus' in el.attrs: del el['autofocus']
        if el.name=='form': el['action']='#'+key
        if el.name=='button': el['type']='button'
        if 'style' in el.attrs:
            style=normal_style(el['style'])
            if el.has_attr('disabled'):
                style=style.replace('background:var(--line)','background:var(--inset)')
            if el.name=='button' and 'background:var(--amber)' in style:
                style=style.replace('background:var(--amber)','background:var(--primary)').replace('color:var(--amber-ink)','color:var(--on-primary)')
            # Text link colour is neutral; statuses retain their existing word and colour.
            if el.name=='a': style=style.replace('color:var(--blue-text)','color:var(--text-support)')
            if style not in STYLES: STYLES[style]='s'+str(len(STYLES)+1)
            el['class']=el.get('class',[])+[STYLES[style]]
            # Add semantic hooks before removing source presentation.
            if 'var(--on-primary)' in style: el['class']+=['source-primary']
            if el.name=='select' and 'opacity:0' in style: el['class']+=['native-overlay']
            if 'flex:999 1 520px' in style: el['class']+=['wrap-column']
            if 'position:sticky' in style: el['class']+=['source-sticky']
            if 'flex:1 1 360px' in style: el['class']+=['wrap-copy']
            del el['style']
    assert main.get_text(' ',strip=True)==CONTENT_FINGERPRINTS[key], key+' content changed'
    return str(main)

def overview_content(prefix, scene='overview'):
    soup=BeautifulSoup(OVERVIEW[scene],'html.parser')
    for el in soup.find_all(True):
        if el.get('id'): el['id']=prefix+'-'+el['id']
        if el.get('aria-controls'): el['aria-controls']=prefix+'-'+el['aria-controls']
        if el.name=='a':
            dest=el.get('data-destination','')
            el['href']='#'+('captain' if 'Captain' in dest else 'team' if 'Team' in dest else 'work')
    return str(soup)

def device(key,width=1440,theme=None,opened=False):
    prefix=f'{key}-{width}-{theme or "auto"}'
    cls='device '+('phone narrow' if width==320 else 'phone' if width==390 else 'medium' if width==1024 else '')
    themeattr=f' data-theme="{theme}"' if theme else ''
    content=overview_content(prefix) if key=='overview' else app_content('captain' if key=='shell' else key,prefix)
    if key=='overview': content='<main class="screen tab-overview"><header class="overview-shell-head"><strong>Northstar Shop</strong><span>Updated just now</span></header>'+content+'</main>'
    if width==320: content=''
    return f'<div class="{cls}"{themeattr} data-frame="{key}-{width}">'+shell('Captain' if key=='shell' else 'Work' if key=='ticket' else key.title(),prefix,key=='overview',opened,key)+content+'</div>'

def frames(key):
    widths=[1440,1024,390,320] if key=='shell' else [1440,390]
    out=[]
    for width in widths:
        common=f'data-size="{width}"'
        caption=f'{width} CSS px · '+('phone' if width<500 else 'desktop')+' · actual size'
        out.append(f'<figure class="frame-wrap {"compare-single" if key in ["shell","overview"] else ""}" {common}><figcaption>{caption}</figcaption>'+device(key,width)+'</figure>')
        if key in ['shell','overview']:
            # Comparison wrappers still follow the global width selection.
            pair=''.join(f'<figure><figcaption>{name.title()} · {width} CSS px</figcaption>'+device(key,width,name)+'</figure>' for name in ['dark','light'])
            out.append(f'<div class="frame-wrap compare-width" {common}><div class="comparison"><div class="frame-set">{pair}</div></div></div>')
    return '<div class="frame-stage" tabindex="0" aria-label="Frame gallery, scroll horizontally to inspect at actual size"><div class="frame-set">'+''.join(out)+'</div></div>'


def theme_sheet(name,theme):
    ramp=''.join(f'<span class="swatch"><i style="background:var(--neutral-{i})"></i><code>neutral-{i}</code>{resolve(theme,"--neutral-"+str(i))}</span>' for i in range(1,13))
    roles=''.join(f'<span class="swatch"><i style="background:var(--{token})"></i>{token}</span>' for token in ['page','navigation','card','inset','floating','selected-fill','separator','control-edge','text-primary','text-support','text-quiet','focus-ring'])
    statuses=''.join(f'<span class="pill status-{role}"><i class="mark" aria-hidden="true"></i>{word}</span>' for role,word in [('needs','Needs you'),('done','Done / safe'),('live','Live / moving'),('failure','Failure / heads-up')])
    return f'<article class="sheet-theme" data-theme="{name}"><h2>{name.title()}</h2><p class="muted">'+('Charcoal surfaces rise toward the light. Edges carry depth.' if name=='dark' else 'Warm off-white canvas, white cards, deeper neutral controls.')+f'</p><h3>Neutral ramp</h3><div class="ramp">{ramp}</div><h3>Semantic roles</h3><div class="roles">{roles}</div><h3>Status has a word</h3><div class="row">{statuses}<span class="pill">○ Inactive</span></div><table class="ratio-table"><caption>Measured sRGB pairs · text ≥ 4.5:1, reading ≥ 7:1, boundaries ≥ 3:1</caption><thead><tr><th>Pair</th><th>Contrast</th></tr></thead><tbody>{ratio_rows(theme,name)}</tbody></table></article>'

def style_sheet():
    types=''.join(f'<div class="scale-line"><code>type-{role}<br>{size}px / {line}px</code><span style="font-size:var(--type-{role});line-height:{line}px">{sample}</span></div>' for role,size,line,sample in [('meta',12,18,'Updated 14m ago'),('label',13,20,'People and agents'),('row',14,20,'Captain · Overview · Work'),('reading',15,24,"Tell Captain what you’d like built."),('input',16,24,'Search this board'),('section',17,24,'Where it is'),('card',20,26,'Checkout'),('title',26,32,'Work'),('title-phone',22,28,'Work')])
    spaces=''.join(f'<span><i style="height:var(--space-{key})"></i><code>space-{key}</code>{value}px</span>' for value,key in SPACE.items())
    return '<div class="sheet-grid">'+theme_sheet('dark',DARK)+theme_sheet('light',LIGHT)+'</div>'+f'''<div class="specimens"><article class="specimen"><h3>Named type roles</h3>{types}<p class="muted">Geist 400 / 500 / 600. IDs use the platform mono face; the Overview headline retains v5’s 44px desktop / 30px phone scale.</p></article><article class="specimen stack"><h3>Space, shape and depth</h3><div class="space-scale">{spaces}</div><p>Control gap 8 · avatar gap 12 · card inset 24 · section gap 32 · page gutter 32 / 24 / 16.</p><div class="row"><span class="pill">Control · 8</span><span class="pill">Card · 12</span><span class="pill">Overview · 18</span><span class="pill">Dialog · 20</span></div><div class="state-toast">Menu / toast elevation</div><div class="state-dialog">Dialog elevation</div><p class="muted">Ordinary rows and cards have no shadow. Floating layers use an edge and a restrained shadow.</p><h3>Brand and identity</h3><div class="row"><img src="autokolab-croc.svg" width="60" height="61" alt="Original green AutoKolab croc"><span class="avatar person">A</span><span>Ana</span><span class="avatar">B</span><span>builder</span></div><p>Green in the original logo is the brand exception. Agent tiles are neutral. The standalone croc stays in the v5 welcome and calm moments.</p><h3>Motion</h3><p>140ms surface changes. 200ms overlays in implementation. No hover movement. No page entrance animation. Reduced motion removes all transitions and loops.</p></article></div>'''


def states(name):
    return f'''<article class="sheet-theme" data-theme="{name}"><h2>{name.title()} · shared states</h2>
    <div class="state-box"><h4>Buttons, links, inputs, pills, avatars and icons</h4><div class="row"><button class="primary">New ticket</button><button>Search</button><button disabled>Record</button><a href="#captain">Open the plan</a></div><label class="stack">Search this board<input placeholder="Search this board"></label><div class="row"><span class="pill status-done"><i class="mark"></i>Saved</span><span class="pill">Contract</span><span class="avatar person">A</span><span>Ana</span><span class="avatar">B</span><span>builder</span></div><div class="row"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="10" cy="10" r="6"></circle><path d="m15 15 5 5"></path></svg>Search<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 12l5 5 9-10"></path></svg>Done<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 5h16v11H9l-5 4z"></path></svg>Room</div></div>
    <div class="state-box"><h4>Loading · CaptainHome.tsx</h4><p>Loading the conversation…</p><div class="skeleton-bars" aria-hidden="true"><i></i><i style="width:72%"></i><i style="width:48%"></i></div><p class="muted">Retain the message. Neutral skeletons appear only after the existing delay.</p></div>
    <div class="state-box"><h4>Empty · Board.tsx</h4><strong>The board is empty.</strong><a href="#captain">Tell Captain what you'd like built.</a></div>
    <div class="state-box"><h4>First-load error · approved Overview v5</h4><div class="v5-states">{overview_content('error-'+name,'error')}</div></div>
    <div class="state-box"><h4>Dialog · CommandPalette.tsx, open Search</h4><div class="state-dialog" role="group" aria-label="Search dialog specimen"><input aria-label="Command" placeholder="Jump to a ticket, person or decision, or run a command"><div class="state-menu"><div class="selected-row">Go to Work</div><div>Go to Team</div><div>New ticket</div></div></div></div>
    <div class="state-box"><h4>Dropdown · project switcher open</h4><div class="state-menu"><div class="selected-row">Shop <span aria-hidden="true">✓</span></div><div>+ New project</div></div></div>
    <div class="state-box"><h4>Toast · shared feedback specimen</h4><div class="state-toast"><span>Saved</span><button>Undo</button></div></div>
    <div class="state-box"><h4>Tooltip · Workspace.tsx</h4><span class="state-tooltip">Search and jump anywhere (⌘K)</span></div>
    <div class="state-box"><h4>Focus and disabled control</h4><div class="row"><button class="focus-sample">Search</button><button disabled>Record</button></div><p class="muted">2px continuous ring, 2px gap. Disabled text remains readable.</p></div></article>'''

NOTES={
 'shell':('The shared shell','Nine peer destinations. A quiet gap after Room on desktop. At 1024 the rail becomes 208px; on phones it becomes a permanent 3×3 grid in normal page flow. Account and appearance follow the grid.'),
 'captain':('Captain','Current Shop conversation, including questions, settled messages, the plan and composer. Plain Captain messages keep their reading rhythm; person bubbles and the composer use shared neutral surfaces. Scroll the full frame to reach the composer.'),
 'overview':('Overview · approved v5','A1: one question waiting. The Northstar Shop fixture, question row, headline, goal cards, agent rows, progress shapes and responsive geometry are preserved from v5. Only shared colours and the surrounding shell change.'),
 'work':('Work · board','The real By agent preview retains all four inner views, search, people filters, quick filters, lanes, cards and the hidden-empty-column note. The board scrolls inside its region on phones.'),
 'ticket':('Work · ticket','SH-2 retains its editable title, description, acceptance checks, steps, activity and complete Details / Context column. Columns wrap in source order on phones. Native selectors retain every option.'),
 'team':('Team','People, all eight agent records, models, effort choices, ownership, limits and Captain controls remain. Neutral tiles distinguish agents from people without vendor colours.'),
 'room':('Room','The current conversation, bookkeeping folds, participant lists and composer remain. The conversation has its own scroll region; the participant column wraps on phones.'),
 'decisions':('Decisions','The three current records retain their exact words, contract label, source ticket links and replacement controls. Guide / Decisions remains the inner navigation.'),
 'guide':('Guide','Concept, Architecture and Rules keep their Markdown and edit controls. The existing page title still says Decisions, because Guide is currently an inner view. The shell adds its direct destination without rewriting the tab.'),
 'results':('Results','All existing metrics, chart labels, tables, definitions, traffic caveats, usage and export controls remain. Values use the card type role, with no oversized numerical emphasis. Tables scroll locally on phones.'),
 'settings':('Settings','The three merge choices, Notifications and Invite retain their current wording and controls. Theme selection stays in the shell; selected preferences are neutral, never blue activity or green success.')}

parts=['''<!doctype html><html lang="en" data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AutoKolab · appearance gallery · AK-187</title><script src="gallery.js"></script><link rel="stylesheet" href="tokens.css"><link rel="stylesheet" href="gallery.css"><link rel="stylesheet" href="overview.css"><link rel="stylesheet" href="snapshot-styles.css"></head><body data-width="1440"><header class="gallery-header"><span class="eyebrow">AK-187 / VISUAL REFERENCE / 18 OCTOBER 2026</span><h1>A calm workspace, in dark and light.</h1><p>The current app’s words and controls, with one shared visual system. Open this folder’s index.html directly; no server, network or build is needed.</p><p>Choose a width, then use the contents to visit a frame. Wide frames stay at actual size: scroll their gallery horizontally. App actions are static specimens; themes, frame navigation and native disclosures work.</p></header><div class="gallery-controls"><label>Appearance <select id="theme"><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label><label>Frame width <select id="width"><option value="1440">Desktop · 1440</option><option value="1024">Shell · 1024</option><option value="390">Phone · 390</option><option value="320">Nav grid · 320</option></select></label><label><input id="both" type="checkbox"> Show both side by side · shell and Overview</label><a href="README.md">Source map &amp; checks</a></div><nav class="contents" aria-label="Gallery contents"><a href="#style-sheet">Style sheet</a><a href="#shared-states">Shared states</a>''']
parts += [f'<a href="#{key}">{title}</a>' for key,(title,note) in NOTES.items()]
parts += ['</nav><main><section class="chapter" id="style-sheet"><div class="chapter-title"><span class="index">00</span><h2>The style sheet</h2></div><p class="annotation">Both palettes are shown together for inspection. The numeric ramp feeds semantic roles, then control roles. Quiet text stays readable; essential boundaries use a stronger token than decorative separators.</p>'+style_sheet()+'</section>']
parts += ['<section class="chapter" id="shared-states"><div class="chapter-title"><span class="index">01</span><h2>Shared states</h2></div><p class="annotation">Fixed dark and light specimens. Dialog, dropdown and toast are intentionally shown open. These are visual samples, not new content added to any tab.</p><div class="sheet-grid">'+states('dark')+states('light')+'</div></section>']
for i,(key,(title,note)) in enumerate(NOTES.items(),2):
    parts.append(f'<section class="chapter" id="{key}"><div class="chapter-title"><span class="index">{i:02d}</span><h2>{title}</h2></div><p class="annotation">{note}</p>'+frames(key))
    if key=='shell':
        parts.append('''<div id="shell-states" class="specimen"><h3>Navigation states · active, hover, focus, pressed</h3><div class="nav-states"><div><span class="eyebrow">Active</span><nav class="shell-pages"><a href="#work" aria-current="page">Work</a></nav></div><div><span class="eyebrow">Hover</span><nav class="shell-pages"><a class="nav-hover" href="#work">Work</a></nav></div><div><span class="eyebrow">Keyboard focus</span><nav class="shell-pages"><a class="focus-sample" href="#work">Work</a></nav></div><div><span class="eyebrow">Pressed</span><nav class="shell-pages"><a class="nav-pressed" href="#work">Work</a></nav></div></div><div class="specimens"><div><h3>Project switcher · open</h3><details class="project-switch" open><summary>Shop <span>⌄</span></summary><div class="menu"><a href="#overview">Shop <span>✓</span></a><a href="#shell">+ New project</a></div></details></div><div><h3>Account</h3><a class="account-person" href="#shell-states"><span class="avatar person">A</span>Ana</a><button class="signout">Sign out</button></div></div><p class="annotation" style="margin-top:112px">The project dropdown contains projects only. On short windows the rail scrolls as one region in the eventual app. No tab moves into a menu. Phone navigation can scroll offscreen while reading; it never collapses.</p></div>''')
    parts.append('</section>')
parts.append('</main><footer class="gallery-footer">Static source snapshots, not a live application. Geist is bundled under the SIL Open Font License. No application code, production data or environment settings are changed. Browser rendering remains unverified in this sandbox; see README.</footer></body></html>')
document=BeautifulSoup('\n'.join(parts),'html.parser')
existing_ids={el['id'] for el in document.select('[id]')}
for el in document.select('[aria-controls]'):
    if el['aria-controls'] not in existing_ids: del el['aria-controls']
(HERE/'index.html').write_text(str(document)+'\n')
(HERE/'snapshot-styles.css').write_text('/* Generated presentation rules for the unchanged demo markup. */\n'+'\n'.join(f'.{name}{{{style}}}' for style,name in STYLES.items())+'''
/* Explicit shared-role overrides, after the source's preserved layout rules. */
.page-title{padding:20px var(--page-gutter)}
.content .source-primary{background:var(--action-fill);color:var(--action-text)}
.phone .content .wrap-column,.phone .content .wrap-copy{flex-basis:100%!important}
.content .source-sticky{position:relative!important;top:auto!important}
.content .native-overlay{min-height:100%!important;font-size:16px}
.phone .content label:has(input){height:auto!important;min-height:44px}
.content label:has(input[aria-label="Search this board"]){height:auto;min-height:40px;border-color:var(--control-edge)}
.phone .content a[role=button]{min-width:44px}
''')
# Check the least favourable neutral surfaces, not only the representative rows printed on the sheet.
for name,theme in [('dark',DARK),('light',LIGHT)]:
    surfaces=['--page','--navigation','--card','--inset','--hover-fill','--pressed-fill','--selected-fill','--floating']
    for fg in ['--text-primary','--text-reading','--text-support','--text-quiet']:
        for bg in surfaces: assert contrast(theme,fg,bg)>=4.5,(name,fg,bg,contrast(theme,fg,bg))
    for role in ['needs','done','live','failure']:
        for bg in surfaces+[f'--{role}-fill']:
            assert contrast(theme,f'--{role}-text',bg)>=4.5,(name,role,bg)
            assert contrast(theme,f'--{role}-mark',bg)>=3,(name,role,bg)
    for fg in ['--control-edge','--focus-ring']:
        for bg in surfaces: assert contrast(theme,fg,bg)>=3,(name,fg,bg,contrast(theme,fg,bg))
(HERE/'contrast.json').write_text(json.dumps(REPORT,indent=2)+'\n')
(HERE/'content-manifest.json').write_text(json.dumps(CONTENT_FINGERPRINTS,indent=2)+'\n')
print(f'Built index.html; preserved {len(CONTENT_FINGERPRINTS)} current demo views; {len(REPORT)} visible contrast rows pass; all neutral/status/control surface combinations pass.')
