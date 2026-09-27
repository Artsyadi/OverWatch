"""Build the six-slide showcase PDF. Content is editable in this source."""
from pathlib import Path
from reportlab.pdfgen.canvas import Canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "pdf" / "Overwatch-pitch.pdf"
OUT.parent.mkdir(parents=True, exist_ok=True)
pdfmetrics.registerFont(TTFont("Segoe", "C:/Windows/Fonts/segoeui.ttf"))
pdfmetrics.registerFont(TTFont("SegoeBold", "C:/Windows/Fonts/segoeuib.ttf"))
pdfmetrics.registerFontFamily("Segoe", normal="Segoe", bold="SegoeBold")
W, H = 960, 540
BG, FG, MUTED, MINT = "#111A13", "#EDF1E9", "#AAB9A0", "#B9E6A7"
c = Canvas(str(OUT), pagesize=(W,H))
c.setTitle("Overwatch - Origin Weekend Prompt C")
c.setAuthor("Overwatch team")

def text(value,x,top,size=20,color=FG,bold=False,width=830,leading=None):
    style=ParagraphStyle("copy",fontName="SegoeBold" if bold else "Segoe",fontSize=size,leading=leading or size*1.35,textColor=HexColor(color))
    p=Paragraph(value,style)
    _, height=p.wrap(width, H)
    if top+height>498:
        raise ValueError(f"Text exceeds slide content boundary: {value[:80]}")
    p.drawOn(c,x,H-top-height)
    return height

def base(number,label):
    c.setFillColor(HexColor(BG));c.rect(0,0,W,H,fill=1,stroke=0)
    text("overwatch.",48,27,17,MINT,True)
    text(label.upper(),230,32,9,MUTED,width=650)
    c.setStrokeColor(HexColor("#34432D"));c.setLineWidth(.7);c.line(48,43,912,43)
    c.setFillColor(HexColor(MUTED));c.setFont("Segoe",8)
    c.drawString(48,25,"ORIGIN WEEKEND 2026    /    PROMPT C: NEW OPERATING SYSTEMS FOR THE PHYSICAL WORLD")
    c.drawRightString(912,25,f"{number:02d} / 06")

def footer_source(value):
    text(value,48,472,8,MUTED,width=850,leading=11)

def row(label,copy,y):
    text(label,48,y,17,MINT,True,width=230)
    text(copy,300,y,18,FG,width=610)

base(1,"Problem and customer")
text("Orders break at<br/>the handoff.",48,102,48,FG,True,width=720,leading=57)
text("Overwatch coordinates warehouse work across people,<br/>AI planning and robot transport.",48,246,25,MINT,width=835)
text("A wrong pick, an unrecorded stock move or a missing item can turn one order into rework and a second shipment.",48,350,21,MUTED,width=795)
footer_source("Starting context: Aditya's work in USC bookstore / mailroom storage. The current site is human-operated.")
c.showPage()

base(2,"Customer insights and market")
text("The handoff needs a shared record",48,92,33,FG,True)
text("50+",48,166,62,MINT,True,width=240)
text("staff conversations reported by Aditya",48,244,17,MUTED,width=235)
text("Staff asked for item verification, accurate stock after every move, and clear ownership when work gets blocked.",335,167,23,FG,width=548)
text("Initial customer hypothesis",335,288,15,MINT,True,width=548)
text("Small warehouse teams adopting mixed human and robot workflows. The first accessible discovery setting is campus storage.",335,321,19,FG,width=548)
text("Competition includes warehouse management software and fleet orchestration providers such as Formant and SVT Robotics.",48,410,16,MUTED,width=840)
footer_source("Evidence: user-reported informal conversations, not a representative survey. Competitor references: formant.ai/fleet-orchestration and svtrobotics.com.")
c.showPage()

base(3,"Working MVP")
text("One goal becomes executable work",48,90,34,FG,True)
text('"Fulfill order #1042"',48,151,26,MINT)
row("PLAN + APPROVE","A planner proposes the work. The supervisor approves it.",226)
row("VERIFY + HAND OFF","A person replenishes stock and verifies picks. The confirmed tote releases a robot mission.",289)
row("RECOVER + COMPLETE","An obstruction changes the route. Arrival unlocks receipt, checking, packing and dispatch.",369)
footer_source("Implemented local demo. Robot motion and goods are simulated. Live AI requires a configured API key; the current no-key mode is labeled rules-based.")
c.showPage()

base(4,"Value and differentiation hypothesis")
text("The work record drives the next action",48,92,32,FG,True)
row("Item accuracy","Wrong IDs are rejected before stock changes. Missing order contents prevent dispatch.",173)
row("Inventory integrity","Reserve available stock, move it into the tote, then decrement on-hand at carrier handoff.",254)
row("Exception ownership","A blocked mission raises an incident. Every recovery and handoff names the responsible actor.",335)
text("Pilot measures: inventory discrepancies, incomplete dispatches and time to recover from blocked work. No savings claim yet.",48,423,16,MINT,width=850)
c.showPage()

base(5,"Business model hypothesis")
text("Start with one warehouse team",48,93,36,FG,True)
text("Buyer",48,177,15,MINT,True,width=180)
text("An operations manager responsible for fulfillment accuracy and coordination.",270,173,22,FG,width=610)
text("Revenue",48,261,15,MINT,True,width=180)
text("A site subscription, with an optional integration fee when connecting a real robot fleet. Validate willingness to pay first.",270,257,22,FG,width=610)
text("First customers",48,371,15,MINT,True,width=190)
text("Begin with a supervised campus pilot. Test referrals through warehouse operators and robot integrators as a route to the first 100 customers.",270,365,21,FG,width=610)
footer_source("All buyer, pricing and acquisition statements are hypotheses. No signed customer, revenue or robot deployment is claimed.")
c.showPage()

base(6,"Execution and next steps")
text("Next: one supervised pilot",48,93,37,FG,True)
text("BUILT",48,176,12,MINT,True,width=360)
text("A working order workflow<br/>Verified stock movements<br/>Robot rerouting and failure handling<br/>Supervisor and worker communication<br/>A shared event history",48,210,21,FG,width=385,leading=34)
text("VALIDATE NEXT",502,176,12,MINT,True,width=380)
text("Run in shadow mode with a willing site.<br/><br/>Measure errors and recovery time.<br/><br/>Connect one real robot, then move to a shared authenticated backend.",502,210,21,FG,width=385,leading=28)
footer_source("Showcase: the running local app, a real screen recording, and this six-slide pitch. Public deployment and live AI access require separate setup.")
c.showPage()
c.save()
reader=PdfReader(str(OUT))
assert len(reader.pages)==6
assert all(len(page.extract_text() or "")>200 for page in reader.pages)
print(f"Created {OUT} ({len(reader.pages)} pages)")
