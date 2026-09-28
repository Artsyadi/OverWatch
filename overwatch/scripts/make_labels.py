"""Regenerate printable labels with Python + reportlab. Runtime app needs only Node 24+."""
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor, black, white
from reportlab.lib.pagesizes import letter
from reportlab.graphics.shapes import Drawing
from reportlab.graphics import renderPDF
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.barcode import code128
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import json

ROOT=Path(__file__).resolve().parents[1]
# Embed fonts for consistent print metrics. Fall back to PDF core fonts on other systems.
fonts=Path('/usr/share/fonts/truetype/dejavu')
if fonts.exists():
    for name,filename in [('Helvetica','DejaVuSans.ttf'),('Helvetica-Bold','DejaVuSans-Bold.ttf'),('Courier','DejaVuSansMono.ttf'),('Courier-Bold','DejaVuSansMono-Bold.ttf')]:
        pdfmetrics.registerFont(TTFont(name,str(fonts/filename)))
OUT=ROOT/'public'/'labels.pdf'
W,H=letter
ink=HexColor('#173328'); muted=HexColor('#52665b'); line=HexColor('#cfdbcc'); green=HexColor('#e8f3dd')
c=canvas.Canvas(str(OUT),pagesize=letter)
c.setTitle('Overwatch - Kitchen pilot labels and setup')
c.setAuthor('Overwatch')

def text(x,y,s,size=10,font='Helvetica',color=ink):
    c.setFillColor(color);c.setFont(font,size);c.drawString(x,y,s)
def qr(code,x,y,size):
    widget=QrCodeWidget(code,barLevel='M',barBorder=4)
    x0,y0,x1,y1=widget.getBounds();d=Drawing(size,size,transform=[size/(x1-x0),0,0,size/(y1-y0),0,0]);d.add(widget)
    renderPDF.draw(d,c,x,y)
def header(kicker,title,subtitle,page):
    c.setFillColor(ink);c.rect(0,H-94,W,94,fill=1,stroke=0)
    text(34,H-26,'OVERWATCH / '+kicker,9,'Helvetica-Bold',HexColor('#b7f46a'))
    text(34,H-53,title,22,'Helvetica-Bold',white)
    text(34,H-73,subtitle,9,'Helvetica',HexColor('#d1dccf'))
    text(34,22,'Print at 100% / Actual size. Keep the white border around each code.',8,color=muted)
    text(W-75,22,f'{page} / 4',8,color=muted)
def card(x,y,title,sub,code,product=False):
    width,height=260,290
    c.setStrokeColor(line);c.setDash(3,3);c.roundRect(x,y,width,height,8,stroke=1,fill=0);c.setDash()
    text(x+16,y+height-29,title,18,'Helvetica-Bold')
    text(x+16,y+height-48,sub,9,color=muted)
    qr(code,x+(width-150)/2,y+87,150)
    c.setFont('Courier-Bold',11);c.setFillColor(black);c.drawCentredString(x+width/2,y+70,code)
    if product:
        b=code128.Code128(code,barHeight=27,barWidth=.9,humanReadable=False)
        b.drawOn(c,x+(width-b.width)/2,y+28)
        text(x+16,y+12,'QR and barcode encode the same product ID.',8,color=muted)
    else:
        text(x+16,y+29,'Attach to this exact physical location.',9,color=muted)
        text(x+16,y+14,'Scan one label at a time.',9,color=muted)

header('START HERE','Your kitchen, one connected path.','A real camera workflow with labelled products, checkpoints, and shelf positions.',1)
text(34,665,'1. Mark one real corridor in this order.',13,'Helvetica-Bold')
text(34,647,'Place labels along the accessible passage. No alternate path is assumed.',9)
# Exact topology from warehouse.json, deliberately schematic.
points={'RECEIVING':(85,449),'WEST':(190,484),'RACK_A':(295,519),'EAST':(400,554),'RACK_B':(510,589)}
model=json.loads((ROOT/'warehouse.json').read_text())
c.setStrokeColor(HexColor('#799268'));c.setLineWidth(3)
for e in model['edges']:
    a,b=points[e['a']],points[e['b']];c.line(*a,*b)
for key,(x,y) in points.items():
    c.setFillColor(ink);c.circle(x,y,6,fill=1,stroke=0)
    c.setFillColor(ink);c.setFont('Helvetica-Bold',10);c.drawCentredString(x,y+15 if key!='RECEIVING' else y-21,key.replace('_',' '))
text(34,618,'Schematic only. WEST / EAST are marker names, not compass directions.',8,color=muted)
text(34,410,'Rack A: first dry storage zone. Rack B: second dry storage zone.',9,color=muted)
text(34,395,'A blocked corridor means stop and inspect; there is no invented detour.',9,color=muted)
text(34,378,'2. Cut and attach the labels.',13,'Helvetica-Bold')
for i,s in enumerate(['Page 2: four product labels (both QR and Code 128).','Page 3: four distinct shelf / tray positions in two dry storage zones.','Page 4: West, East, Rack A, and Rack B checkpoints.','Cut out the RECEIVING checkpoint below.']):text(34,357-i*16,s,9)
text(34,270,'3. Scan a batch, approve on laptop.',13,'Helvetica-Bold')
for i,s in enumerate(['Phone: start batch, scan each barcode once.','Duplicate barcode? Red error; not added.','Finish batch > review / approve on laptop.','Begin put-away > scan checkpoints.','Scan shelf + product > place > confirm.']):text(34,247-i*18,s,10)
text(34,123,'MAP DOES NOT MATCH YOUR KITCHEN?',9,'Helvetica-Bold')
for i,s in enumerate(['Edit nodes/edges in warehouse.json and restart.','Never assume a drawn path exists in your room.','Camera observations are advisory, not safety certification.']):text(34,106-i*14,s,8,color=muted)
c.setStrokeColor(line);c.setDash(3,3);c.roundRect(372,60,206,231,8,stroke=1,fill=0);c.setDash()
text(388,266,'RECEIVING',17,'Helvetica-Bold');text(388,247,'Start / receiving table',9,color=muted)
qr('OWN:RECEIVING',405,93,140)
c.setFillColor(black);c.setFont('Courier-Bold',10);c.drawCentredString(475,78,'OWN:RECEIVING')
c.showPage()
header('PRODUCT LABELS','Batch scan. Laptop approval.','Attach each label to the matching product or a clearly labelled demo prop.',2)
for p,(x,y) in zip(model['products'],[(34,365),(318,365),(34,53),(318,53)]):
    card(x,y,p['name'],f"{p['category'].upper()} / Product ID",p['sku'],True)
c.showPage()
header('SHELF LABELS','Every shelf has an identity.','Scan the assigned shelf, rescan the product, then confirm physical placement.',3)
for s,(x,y) in zip(model['shelves'],[(34,365),(318,365),(34,53),(318,53)]):
    card(x,y,s['id'],s['name'].replace(' · ',' / '),'OWL:'+s['id'])
c.showPage()
header('CHECKPOINT LABELS','Know where the next move begins.','Scan at each checkpoint. RECEIVING is on page 1. These are location IDs, not GPS.',4)
for n,(x,y) in zip(model['nodes'][1:],[(34,365),(318,365),(34,53),(318,53)]):
    card(x,y,n['id'].replace('_',' '),n['name'],'OWN:'+n['id'])
c.save()
print(OUT)
