"""Hand-built architecture and street life for the extended Coastal Line.

Executed by build_assets.py, so every asset is saved in the same editable Blender library.
Dimensions are in metres: this is architecture for people, rather than a miniature set.
"""
P.update({
    'stem':material('Mushroom · warm limestone',(.77,.70,.49)),
    'cap':material('Mushroom · cinnamon cap',(.62,.22,.14)),
    'caplight':material('Mushroom · worn vermilion',(.83,.36,.19)),
    'gill':material('Mushroom · glowing gills',(.95,.67,.31),.8,0,.45),
    'sage':material('Mushroom · sage cap',(.31,.45,.30)),
    'pumpkin':material('Pumpkin · amber rind',(.81,.35,.085)),
    'pumpkin2':material('Pumpkin · shaded ribs',(.63,.22,.055)),
    'pumpkin3':material('Pumpkin · sunlit ribs',(.94,.48,.14)),
    'violet':material('Festival · aubergine',(.26,.18,.32)),
    'linen':material('Natural linen',(.73,.64,.46)),
    'bloom':material('Fuchsia flowers',(.79,.32,.44)),
    'wheat':material('Harvest wheat',(.76,.56,.24)),
    'teal':material('Observatory · oxidised copper',(.14,.40,.39),.48,.25),
    'lens':material('Tideglass · celestial blue',(.19,.45,.57),.15,.45),
    'stone':material('Weathered limestone',(.56,.54,.46)),
    'indigo':material('Evening blue fabric',(.17,.26,.39)),
    'paper':material('Postcards and notices',(.88,.79,.59)),
})

def lathe(name,profile,mat,parent,segments=32,ribs=0):
    verts=[]
    for radius,z in profile:
        for i in range(segments):
            a=i*math.tau/segments;r=radius*(1+ribs*math.cos(a*10))
            verts.append((math.cos(a)*r,math.sin(a)*r,z))
    faces=[]
    for j in range(len(profile)-1):
        for i in range(segments):
            a=j*segments+i;b=j*segments+(i+1)%segments
            faces.append((a,b,b+segments,a+segments))
    # Profiles traced from the crown downward need the opposite winding for outward normals.
    if profile[0][1]>profile[-1][1]:faces=[tuple(reversed(face)) for face in faces]
    o=mesh(name,verts,faces,mat,parent)
    return o

def ring(name,loc,major,minor,mat,parent,rotation=None,segments=24):
    bpy.ops.mesh.primitive_torus_add(major_radius=major,minor_radius=minor,major_segments=segments,minor_segments=6,location=loc)
    o=bpy.context.object
    if rotation:o.rotation_euler=rotation
    return assign(o,mat,parent,name)

def round_window(parent,x,y,z,r=.55):
    # Raised casement and mullions sit proud of the organic facade.
    cyl('Round window light',(x,y,z),r,.10,'light',parent,20,(math.pi/2,0,0))
    ring('Oak porthole',(x,y+.075,z),r,.065,'wood',parent,(math.pi/2,0,0))
    beam('Casement crossbar',(x-r,y+.12,z),(x+r,y+.12,z),.035,'gold',parent)
    beam('Casement upright',(x,y+.12,z-r),(x,y+.12,z+r),.035,'gold',parent)
    box('Window sill',(x,y+.16,z-r-.10),(r*2.3,.35,.12),'wood',parent,.025)

def porch(parent,width=3.3,y=2.8,z=.45):
    for i in range(12):box('Weathered porch plank',(0,y-.8+i*.16,z),(width,.145,.16),'wood' if i%3 else 'linen',parent,.015)
    for side in [-1,1]:
        for yy in [y-.8,y+.8]:
            beam('Porch post',(side*width/2,yy,0),(side*width/2,yy,z+1),.055,'darkwood',parent)
        beam('Porch rail',(side*width/2,y-.8,z+.9),(side*width/2,y+.8,z+.9),.055,'wood',parent)
    for i in range(3):box('Doorstep',(0,y+1+i*.28,z-(i+1)*.12),(1.5,.30,.16),'stone',parent,.025)

def leaves(parent,center,scale=1):
    x,y,z=center
    for i in range(7):
        a=i*2.4;r=.25+i*.025
        o=ico('Garden leaf',(x+math.cos(a)*r,y+math.sin(a)*r,z+.2+i*.075),(.11*scale,.24*scale,.065*scale),'green2' if i%2 else 'green1',parent)
        o.rotation_euler=(.3*math.sin(a),.3*math.cos(a),a)

# FERNBELL: homes grown around old fungal stems, with timber porches and lit gills.
for k in range(3):
    root=asset('mushroom_'+str(k));g=empty('Fernbell home',root)
    h=[4.5,5.8,3.8][k];r=[4.5,5.3,3.9][k]
    lathe('Weathered stem',[(1.6,0),(1.85,1),(1.65,h*.55),(1.35,h),(0,h)],'stem',g,24)
    for i in range(18):
        a=i*math.tau/18
        beam('Stem fluting',(math.cos(a)*1.68,math.sin(a)*1.68,.25),(math.cos(a)*1.36,math.sin(a)*1.36,h),.04,'linen',g)
    cap=lathe('Overhanging mushroom cap',[(0,h+2.6),(r*.35,h+2.5),(r*.70,h+1.8),(r*.96,h+.7),(r,h+.35),(r*.90,h+.08),(0,h+.2)],'sage' if k==1 else 'cap',g,36)
    cap.data.materials.append(P['caplight'])
    for p in cap.data.polygons:
        if k!=1 and p.index%11 in [0,1,2]:p.material_index=1
    ring('Soft cap rim',(0,0,h+.35),r-.12,.12,'gill',g,segments=36)
    for i in range(28):
        a=i*math.tau/28
        beam('Lamplit gill',(math.cos(a)*1.5,math.sin(a)*1.5,h+.16),(math.cos(a)*r*.88,math.sin(a)*r*.88,h+.2),.035,'gill',g)
    for i in range(16):
        a=i*2.4;rr=r*(.30+.50*((i*7)%17)/17)
        zz=h+2.55-1.8*(rr/r)**1.7
        ico('Cap ivory freckle',(math.cos(a)*rr,math.sin(a)*rr,zz),(.23+(i%3)*.10,.28,.085),'cream',g,2)
    box('Round-topped oak door',(0,1.82,1.35),(1.1,.18,2.0),'wood',g,.45)
    for x in [-.40,-.20,0,.20,.40]:box('Door timber seam',(x,1.93,1.15),(.012,.015,1.5),'darkwood',g)
    ring('Door brass knocker',(.27,1.96,1.38),.075,.02,'gold',g,(math.pi/2,0,0))
    round_window(g,-1.15,1.50,h*.65,.43)
    round_window(g,1.15,1.50,h*.65,.43)
    porch(g,3.3,2.25,.42)
    # A tiny stovepipe and roof-level dormer suggest rooms under the cap.
    cyl('Crooked stovepipe',(-1.6,-.2,h+2),.14,2,'black',g,10)
    cyl('Stovepipe rain cap',(-1.6,-.2,h+3.1),.27,.10,'black',g,10)
    leaves(g,(-2.0,1.6,.2));leaves(g,(2.1,1.5,.1),1.2)
    for i in range(7):
        a=i*2.4
        ico('Mossy doorstep rock',(math.cos(a)*2.4,math.sin(a)*2.4,.12),(.5,.36,.18),'stone',g)

root=asset('forest_mushrooms');g=empty('A family of woodland fungi',root)
for i in range(5):
    x=math.sin(i*2.4)*1.2;y=math.cos(i*2.4)*1.1;h=.6+i*.25
    cyl('Young mushroom stem',(x,y,h/2),.10,h,'stem',g,8)
    ico('Young mushroom cap',(x,y,h),(.45+i*.1,.45+i*.1,.23+i*.025),'cap' if i%2 else 'sage',g,2)
    for j in range(3):ico('Young cap spot',(x+math.sin(j*2.4)*.2,y+math.cos(j*2.4)*.2,h+.19),(.07,.08,.045),'cream',g)
leaves(g,(0,0,.1),2)

# LANTERN HOLLOW: generous ribbed pumpkin cottages; festive rather than frightening.
for k in range(2):
    root=asset('pumpkin_house_'+str(k));g=empty('Lantern Hollow cottage',root)
    r=3.5+k*.5
    skin=lathe('Ribbed pumpkin walls',[(0,.15),(r*.72,.2),(r*.98,1.2),(r,2.5),(r*.91,3.8),(r*.64,4.8),(0,5.1)],'pumpkin',g,60,.06)
    for m in ['pumpkin2','pumpkin3']:skin.data.materials.append(P[m])
    for p in skin.data.polygons:p.material_index=1 if p.index%6==3 else (2 if p.index%6==0 else 0)
    beam('Curled woody pumpkin stem',(0,0,4.8),(.35,.12,6.1),.35,'green3',g)
    beam('Bent stem tip',(.35,.12,6.1),(.75,.25,6.45),.25,'wood',g)
    for i in range(14):
        a=i*.45
        ico('Roof vine',(.55+math.cos(a)*.7,.3+math.sin(a)*.7,5.4-i*.075),(.16,.22,.08),'green1',g)
    box('Festival oak door',(0,r*.96,1.48),(1.24,.24,2.5),'violet',g,.5)
    for x in [-.48,.48]:beam('Door arch sides',(x,r*1.02,.3),(x,r*1.02,2.6),.09,'gold',g)
    round_window(g,-1.75,r*.88,2.8,.67)
    round_window(g,1.75,r*.88,2.8,.67)
    round_window(g,0,-r,2.5,.65)
    porch(g,4.2,r+.1,.55)
    # Awning, harvest baskets, a welcome mat and fine stalks make this a home.
    o=box('Striped porch awning',(0,r+.45,3.3),(3.5,1.65,.12),'violet',g,.055);o.rotation_euler[0]=-.13
    for x in [-1.6,1.6]:beam('Awning support',(x,r+1.1,.55),(x,r+1.1,3.35),.05,'wood',g)
    box('Welcome mat',(0,r+.65,.65),(1.25,.65,.03),'wheat',g)
    for x in [-2.1,2.1]:
        cyl('Harvest planter',(x,r*.8,.45),.42,.65,'wood',g,12)
        for j in range(7):beam('Wheat stalk',(x,r*.8,.5),(x+math.sin(j*2.4)*.30,r*.8+math.cos(j*2.4)*.3,1.5+(j%3)*.15),.017,'wheat',g)

root=asset('pumpkins');g=empty('Harvest pumpkins and jack lanterns',root)
for i in range(4):
    x=(i%2)*.8-.4;y=(i//2)*.7-.35;r=.34+i*.07
    o=lathe('Small ribbed pumpkin',[(0,.05),(r,.15),(r*1.03,.4),(r*.7,.67),(0,.72)],'pumpkin' if i%2 else 'pumpkin3',g,24,.08);o.location=(x,y,0)
    beam('Pumpkin stalk',(x,y,.68),(x+.06,y,.86),.055,'green3',g)
    if i%2==0:
        for side in [-1,1]:
            mesh('Cheerful carved eye',[(x+side*.14-.08,y-r-.015,.46),(x+side*.14+.08,y-r-.015,.46),(x+side*.14,y-r-.02,.59)],[(0,1,2)],'light',g)
        box('Jack lantern smile',(x,y-r-.025,.29),(.30,.045,.085),'light',g,.035)

root=asset('scarecrow');g=empty('Friendly harvest keeper',root)
beam('Scarecrow pole',(0,0,0),(0,0,2.7),.065,'wood',g)
beam('Scarecrow arms',(-1.1,0,1.85),(1.1,0,1.85),.075,'wood',g)
ico('Stuffed shirt',(0,0,1.75),(.34,.24,.56),'violet',g,2)
ico('Pumpkin head',(0,0,2.5),(.34,.30,.32),'pumpkin3',g,2)
for x in [-.12,.12]:ico('Friendly eye',(x,-.29,2.54),(.055,.04,.055),'black',g,2)
cyl('Keeper hat brim',(0,0,2.82),.48,.07,'darkwood',g,12)
bpy.ops.mesh.primitive_cone_add(vertices=12,radius1=.29,radius2=.08,depth=.46,location=(0,0,3.06));assign(bpy.context.object,'violet',g,'Tall harvest hat')
for side in [-1,1]:
    beam('Loose sleeve',(side*.28,0,1.92),(side*.9,0,1.80),.15,'violet',g)
    for j in range(4):beam('Straw wrist',(side*.86,0,1.8),(side*1.10,-.07+j*.05,1.70+j*.04),.017,'wheat',g)

# TIDEGLASS: an astronomer's copper dome, open pavilion and enormous working telescope.
root=asset('observatory');g=empty('Tideglass Observatory',root)
cyl('Observatory limestone base',(0,0,.3),5.7,.6,'stone',g,32)
cyl('Circular observatory hall',(0,0,3.0),5.1,5.5,'white',g,32)
for z in [.8,5.5]:ring('Hall cornice',(0,0,z),5.15,.12,'cream',g,segments=32)
for i in range(12):
    a=i*math.tau/12
    cyl('Copper buttress',(math.cos(a)*5.15,math.sin(a)*5.15,2.9),.14,5.5,'teal',g,8)
    window=empty('Observatory porthole',g)
    round_window(window,0,5.16,3,.55)
    window.rotation_euler[2]=a
# Segmented dome with visible curved copper seams, and a purposeful telescope slit.
verts=[];faces=[];N=40;R=9
for j in range(R+1):
    a=j*math.pi/2/R
    for i in range(N):
        p=i*math.tau/N
        verts.append((math.cos(p)*5.3*math.cos(a),math.sin(p)*5.3*math.cos(a),5.75+5.3*math.sin(a)))
for j in range(R):
    for i in range(N):
        if i in [9,10,11]:continue
        a=j*N+i;b=j*N+(i+1)%N
        faces.append((a,b,b+N,a+N))
mesh('Oxidised copper dome',verts,faces,'teal',g)
for i in range(12):
    a=i*math.tau/12
    for j in range(8):
        q=j*math.pi/16;w=(j+1)*math.pi/16
        beam('Dome brass seam',(math.cos(a)*5.32*math.cos(q),math.sin(a)*5.32*math.cos(q),5.75+5.32*math.sin(q)),(math.cos(a)*5.32*math.cos(w),math.sin(a)*5.32*math.cos(w),5.75+5.32*math.sin(w)),.035,'gold',g)
telescope=empty('Telescope',root)
beam('Telescope barrel',(0,0,6.9),(0,6.0,10.1),.75,'indigo',telescope)
beam('Telescope rim',(0,5.8,10.0),(0,6.1,10.16),.90,'gold',telescope)
beam('Blue telescope lens',(0,6.1,10.16),(0,6.15,10.19),.70,'lens',telescope)
beam('Telescope eyepiece',(0,-1.0,6.35),(0,-.35,6.7),.20,'gold',telescope)
for j in range(5):box('Observatory entry stair',(0,5.6+j*.35,.5-j*.09),(2.0,.38,.17),'stone',g,.03)
box('Oak observatory entrance',(0,5.15,1.55),(1.5,.15,2.7),'wood',g,.3)

root=asset('orrery');g=empty('Brass celestial garden',root)
cyl('Orrery pedestal',(0,0,.7),1.2,1.4,'stone',g,16)
beam('Orrery axis',(0,0,1.2),(0,0,4.5),.08,'gold',g)
ico('Golden sun',(0,0,2.8),(.42,.42,.42),'light',g,2)
for i in range(3):
    o=ring('Planet orbit',(0,0,2.8),1.1+i*.6,.035,'gold',g,(.25+i*.35,.25,0),32)
    ico('Tideglass planet',(1.1+i*.6,0,2.8),(.16+i*.055,)*3,'lens' if i%2 else 'caplight',g,2)

# Taller, inhabited seaside buildings: two storeys, narrow balconies, tiled roofs and shops.
for k in range(3):
    root=asset('townhouse_'+str(k));g=empty('Seaside townhouse',root)
    wall=['white','plaster','yellow'][k];h=6.6+k*.45
    box('Hand plastered walls',(0,0,h/2),(5.4,4.8,h),wall,g,.08)
    for z in [.28,3.1]:box('Floor cornice',(0,0,z),(5.55,4.95,.20),'cream',g,.03)
    mesh('Townhouse gables',[(-2.7,-2.4,h),(2.7,-2.4,h),(0,-2.4,h+1.7),(-2.7,2.4,h),(2.7,2.4,h),(0,2.4,h+1.7)],[(0,1,2),(3,5,4)],wall,g)
    mesh('Tiled pitched roof',[(-3.0,-2.7,h),(0,-2.7,h+1.85),(3,-2.7,h),(-3,2.7,h),(0,2.7,h+1.85),(3,2.7,h)],[(0,3,4,1),(1,4,5,2)],'red',g)
    for side in [-1,1]:
        for row in range(7):
            x=side*(row+.5)*.42;zz=h+1.85-abs(x)*1.85/3
            for j in range(10):
                o=box('Rounded clay roof tile',(x,-2.48+j*.54,zz+.05),(.45,.52,.095),'roof2' if (row+j+k)%5==0 else 'red',g,.03);o.rotation_euler[1]=side*math.atan(1.85/3)
        beam('Eaves gutter',(side*3.0,-2.6,h),(side*3.0,2.6,h),.075,'gold',g)
    cyl('Townhouse ridge',(0,0,h+1.9),.13,5.65,'roof2',g,10,(math.pi/2,0,0))
    box('Stone chimney',(-1.8,-.75,h+1.5),(.55,.6,2.0),'white',g,.04)
    box('Chimney coping',(-1.8,-.75,h+2.5),(.75,.80,.16),'stone',g,.04)
    for z in [1.75,4.9]:
        for x in [-1.55,1.55]:
            box('Window stone surround',(x,2.44,z),(1.30,.13,1.85),'cream',g,.1)
            box('Warm occupied window',(x,2.52,z),(1.06,.08,1.55),'light',g,.075)
            box('Window frame',(x,2.57,z),(.065,.055,1.65),'wood',g)
            for zz in [-.32,.30]:box('Window crossbar',(x,2.57,z+zz),(1.1,.055,.05),'wood',g)
            for side in [-1,1]:
                box('Weathered shutter',(x+side*.78,2.51,z),(.38,.12,1.68),'blue' if k!=2 else 'leaf',g,.025)
                for j in range(9):box('Shutter louvre',(x+side*.78,2.58,z-.64+j*.15),(.32,.045,.025),'green',g)
    # A balcony deep enough for a chair and terracotta pots, with proper iron balusters.
    box('Balcony stone slab',(0,3.05,3.85),(4.9,1.35,.18),'stone',g,.045)
    for x in [-2.35,2.35]:beam('Balcony bracket',(x,2.4,3.3),(x,3.55,3.8),.065,'black',g)
    for i in range(17):beam('Balcony iron baluster',(-2.3+i*.285,3.65,3.95),(-2.3+i*.285,3.65,4.85),.022,'black',g)
    beam('Balcony handrail',(-2.4,3.65,4.88),(2.4,3.65,4.88),.045,'black',g)
    for x in [-2,2]:
        cyl('Balcony pot',(x,3.1,4.12),.22,.40,'red',g,10);leaves(g,(x,3.1,4.3))
    box('Tall entry door',(0,2.46,1.3),(.92,.18,2.5),'wood',g,.14)
    for x in [-.32,0,.32]:box('Door recessed panel',(x,2.56,1.4),(.21,.035,1.7),'darkwood',g,.025)
    box('Shop sign',(0,2.65,2.9),(2.0,.18,.45),'green',g,.035)
    for i in range(12):box('Foundation dressed stone',(-2.4+(i%6)*.95,2.413,.38+(i//6)*.35),(.84,.04,.28),'stone' if i%4 else 'cream',g,.03)

root=asset('market_stall');g=empty('Market stall',root)
for x in [-1.6,1.6]:
    for y in [-.85,.85]:beam('Oak stall upright',(x,y,.1),(x,y,2.8),.065,'wood',g)
box('Market counter',(0,0,1.0),(3.3,1.7,.15),'wood',g,.035)
for i in range(12):box('Counter plank',(-1.5+i*.275,-.86,.55),(.25,.07,.85),'wood' if i%3 else 'linen',g,.012)
for i in range(9):
    o=box('Market striped canvas',(-1.6+i*.4,0,2.85),(.40,2.2,.11),'cream' if i%2 else 'blue',g,.045);o.rotation_euler[0]=.12
for i in range(3):
    box('Produce crate',(-1.0+i*1.0,0,1.23),(.82,1.05,.30),'darkwood',g,.025)
    for j in range(12):ico('Market fruit',(-1.2+i*1.0+(j%3)*.16,-.38+(j//3)*.20,1.41),(.095,.10,.095),['scarf','yellow','green2'][i],g,2)

root=asset('street_props');g=empty('Neighbourhood doorstep',root)
for x in [-.60,.55]:
    cyl('Terracotta urn',(x,0,.32),.28,.60,'red',g,12)
    ring('Urn lip',(x,0,.63),.25,.05,'roof2',g)
    leaves(g,(x,0,.65),1.6)
box('Old wooden crate',(0,-.6,.3),(.8,.65,.55),'wood',g,.015)
for z in [.15,.35,.55]:box('Crate slat seam',(0,-.93,z),(.78,.018,.018),'darkwood',g)
for x in [-.33,.33]:box('Crate corner',(x,-.94,.3),(.075,.04,.5),'cream',g)

root=asset('barrel');g=empty('Coopered oak barrel',root)
lathe('Barrel staves',[(.38,0),(.45,.15),(.49,.6),(.45,1.05),(.38,1.2)],'wood',g,16)
for z,r in [(.12,.44),(.33,.48),(.87,.48),(1.08,.43)]:ring('Barrel iron hoop',(0,0,z),r,.03,'black',g,segments=16)
cyl('Barrel lid',(0,0,1.20),.38,.06,'linen',g,16)
for i in range(16):
    a=i*math.tau/16
    beam('Barrel stave seam',(math.cos(a)*.46,math.sin(a)*.46,.18),(math.cos(a)*.46,math.sin(a)*.46,1.03),.008,'darkwood',g)

root=asset('bench');g=empty('Platform bench',root)
for y in [-.25,0,.25]:box('Bench seat slat',(0,y,.55),(2.3,.21,.09),'wood',g,.025)
for z in [.95,1.15]:box('Bench back slat',(0,.40,z),(2.3,.10,.16),'wood',g,.025)
for x in [-.9,.9]:
    beam('Cast iron bench leg',(x,-.25,0),(x,-.25,.53),.045,'black',g)
    beam('Cast iron back frame',(x,.40,0),(x,.40,1.3),.045,'black',g)

root=asset('fountain');g=empty('Village fountain',root)
cyl('Octagonal fountain step',(0,0,.10),2.2,.20,'stone',g,12)
cyl('Fountain basin',(0,0,.45),1.9,.6,'cream',g,12)
cyl('Fountain still water',(0,0,.78),1.70,.025,'lens',g,24)
ring('Fountain coping',(0,0,.78),1.90,.16,'stone',g,segments=12)
cyl('Fountain column',(0,0,1.45),.30,1.35,'stone',g,12)
ico('Fountain brass fish',(0,0,2.35),(.25,.6,.28),'gold',g,2)
ring('Fountain crown',(0,0,2.0),.55,.11,'cream',g,segments=12)

root=asset('windmill');g=empty('Tideglass windmill',root)
lathe('Limestone windmill tower',[(2.1,0),(1.8,4),(1.3,8.5),(0,8.6)],'white',g,16)
bpy.ops.mesh.primitive_cone_add(vertices=16,radius1=1.9,radius2=0,depth=2.5,location=(0,0,9.2));assign(bpy.context.object,'teal',g,'Copper windmill cap')
round_window(g,0,1.85,4.0,.43)
blades=empty('Blades',root)
blades.location=(0,1.9,7.7)
cyl('Windmill axle',(0,2.0,7.7),.30,.60,'wood',g,12,(math.pi/2,0,0))
for i in range(4):
    a=i*math.tau/4
    # Mesh coordinates local to the hub; the imported node spins about Godot Z.
    v=[(0,-.05,0),(.30,-.05,1),(.6,-.05,5.4),(-.45,-.05,5.4),(-.12,-.05,1)]
    vv=[(x*math.cos(a)+z*math.sin(a),y,-x*math.sin(a)+z*math.cos(a)) for x,y,z in v]
    mesh('Windmill linen sail',vv,[(0,1,2,3,4)],'linen',blades)
    beam('Windmill sail spar',(0,0,0),(math.sin(a)*5.5,0,math.cos(a)*5.5),.065,'wood',blades)

root=asset('airship');g=empty('The travelling postal service',root)
ico('Postal balloon',(0,0,5),(3.3,7.2,3.2),'cream',g,3)
for x in [-1.15,1.15]:beam('Postal gondola rope',(x,-2.3,4),(x,-2.3,1.5),.03,'wood',g)
box('Postal gondola',(0,-1.8,1.35),(2.8,3.5,1.05),'green',g,.3)
for y in [-.8,-1.8,-2.8]:box('Gondola warm window',(0,y,1.7),(2.88,.65,.30),'light',g,.06)
mesh('Postal tail fin',[(-.1,5.5,5),(-.1,8.4,5),(-.1,7.1,8.1)],[(0,1,2)],'red',g)

# Residents carry the things their villages make: bread, spores, lanterns and star charts.
for k in range(4):
    root=asset('folk_'+str(k));g=empty('Neighbour',root)
    coat=['scarf','green1','violet','indigo'][k]
    for x in [-.11,.11]:
        box('Trouser leg',(x,0,.34),(.15,.18,.57),'darkwood',g,.035)
        box('Leather shoe',(x,.07,.09),(.18,.30,.16),'black',g,.045)
    ico('Wool coat',(0,0,.90),(.31,.23,.43),coat,g,2)
    for z in [.76,.94,1.10]:ico('Coat brass button',(0,.227,z),(.02,.018,.02),'gold',g,2)
    ico('Resident face',(0,.015,1.43),(.21,.20,.25),'skin',g,2)
    ico('Resident hair',(0,-.02,1.56),(.22,.21,.14),'hair',g,2)
    for x in [-.078,.078]:ico('Kind eye',(x,.196,1.47),(.017,.015,.02),'black',g,2)
    ico('Nose',(0,.214,1.42),(.035,.036,.04),'skin',g,2)
    if k==1:
        ico('Mushroom forager cap',(0,0,1.73),(.34,.29,.16),'cap',g,2)
        for x in [-.12,.12]:ico('Cap ivory dot',(x,.04,1.86),(.06,.07,.025),'cream',g,2)
    elif k==2:
        cyl('Festival hat brim',(0,0,1.68),.32,.045,'violet',g,12)
        bpy.ops.mesh.primitive_cone_add(vertices=12,radius1=.22,radius2=.05,depth=.37,location=(0,0,1.89));assign(bpy.context.object,'violet',g,'Festival hat')
        box('Festival hat band',(0,.195,1.72),(.30,.05,.055),'pumpkin3',g,.02)
    else:
        cyl('Resident hat brim',(0,0,1.67),.30,.05,'linen' if k==0 else 'indigo',g,16)
        ico('Hat crown',(0,0,1.76),(.22,.21,.14),'linen' if k==0 else 'indigo',g,2)
    for side in [-1,1]:
        beam('Coat sleeve',(side*.27,0,1.05),(side*.35,.05,.70),.077,coat,g)
        ico('Resident hand',(side*.35,.05,.67),(.07,.065,.085),'skin',g,2)
    if k==3:
        box('Star atlas',(.35,.10,.52),(.30,.12,.40),'blue',g,.018)
        box('Atlas pages',(.35,.105,.52),(.27,.10,.36),'paper',g)
    else:
        box('Wicker market basket',(.43,.03,.49),(.32,.27,.30),'wheat',g,.04)
        ring('Basket handle',(.43,.03,.71),.13,.023,'wood',g,(math.pi/2,0,0),12)
        ico('Basket produce',(.43,.03,.69),(.13,.13,.10),'yellow' if k==0 else ('cap' if k==1 else 'pumpkin'),g,2)

root=asset('cat');g=empty('The platform cat',root)
ico('Cat body',(0,0,.27),(.20,.42,.22),'cream',g,2)
ico('Cat head',(0,.34,.47),(.19,.19,.19),'cream',g,2)
for x in [-.12,.12]:
    mesh('Cat ear',[(x-.05,.30,.53),(x+.06,.30,.54),(x,.32,.74)],[(0,1,2)],'red',g)
    ico('Cat eye',(x*.65,.508,.49),(.025,.018,.035),'green3',g,2)
for x in [-.11,.11]:
    for y in [-.2,.2]:ico('Cat paw',(x,y,.07),(.07,.12,.07),'white',g,2)
beam('Curled cat tail',(0,-.3,.25),(.1,-.63,.48),.055,'red',g)

root=asset('boat');g=empty('Harbour skiff',root)
mesh('Skiff hull',[(-1.1,-2.7,.5),(1.1,-2.7,.5),(-1.4,1.7,.5),(1.4,1.7,.5),(0,3.1,.55),(-.6,-2.1,-.3),(.6,-2.1,-.3),(-.8,1.6,-.3),(.8,1.6,-.3),(0,2.8,-.1)],[(0,2,7,5),(1,6,8,3),(2,4,9,7),(3,8,9,4),(0,5,6,1),(5,7,8,6)],'blue',g)
for y in [-1.5,0,1.5]:box('Skiff timber seat',(0,y,.30),(2.35,.35,.13),'wood',g,.04)
beam('Skiff mast',(0,.25,.2),(0,.25,5.4),.06,'wood',g)
mesh('Linen triangular sail',[(0,.3,5.2),(0,.3,1.5),(0,2.4,1.7)],[(0,1,2)],'linen',g)

root=asset('palm');g=empty('Mango Tide date palm',root)
for i in range(11):
    z=i*.6;x=math.sin(i*.12)*.8
    cyl('Date palm trunk',(x,0,z+.3),.24-i*.009,.64,'wood',g,10)
    ring('Palm bark scar',(x,0,z+.25),.245-i*.009,.035,'linen',g,segments=10)
for i in range(11):
    a=i*math.tau/11
    last=Vector((.75,0,6.5))
    for j in range(1,7):
        r=j*.6;p=Vector((.75+math.cos(a)*r,math.sin(a)*r,6.5+math.sin(j*.48)*1.2-j*.15))
        beam('Palm frond spine',last,p,.025,'green3',g)
        side=Vector((-math.sin(a),math.cos(a),0))
        breadth=.46*math.sin(j/7*math.pi)
        mesh('Paired palm leaflets',[tuple(last),tuple(p),tuple(p+side*breadth-Vector((0,0,.35))),tuple(p-side*breadth-Vector((0,0,.35)))],[(0,1,2),(1,0,3)],'green1' if i%2 else 'green2',g)
        last=p
for i in range(7):ico('Dates',(.75+math.cos(i)*.27,math.sin(i)*.27,6.1),(.10,.10,.18),'scarf',g,2)

# Add mechanical and human detail to the original tram without changing its upgrade groups.
body=next(o for o in bpy.data.objects if o.name=='Body')
for side in [-1,1]:
    for y in [-2.62,-1.74,-.87,0,.87,1.74,2.62]:
        for z in [.95,1.44]:ico('Brass body rivet',(side*1.165,y,z),(.018,.025,.025),'gold',body,1)
    for y in [-1.9,1.9]:
        for i in range(7):
            ring('Bogie suspension coil',(side*.92,y,.57+i*.027),.11,.018,'black',body,(math.pi/2,0,0),12)
    for i in range(10):box('Oak chassis grain',(side*1.23,-2.6+i*.55,.65),(.012,.43,.016),'darkwood',body)
for y in [-2.93,2.93]:
    beam('Windscreen wiper',(-.45,y*1.028,2.0),(.45,y*1.028,2.46),.017,'black',body)
    beam('Coupling shank',(0,y,.60),(0,y*1.16,.60),.10,'black',body)
    ring('Coupling ring',(0,y*1.17,.61),.16,.05,'black',body,(math.pi/2,0,0),12)
box('Driver control desk',(0,2.43,1.85),(1.65,.45,.14),'wood',body,.07)
for x in [-.42,0,.42]:
    cyl('Driver brass dial',(x,2.43,1.95),.11,.025,'gold',body,16)
    beam('Gauge needle',(x,2.43,1.97),(x+.045,2.48,1.97),.008,'black',body)
beam('Power lever',(.65,2.5,1.95),(.65,2.32,2.25),.035,'gold',body)
ico('Lever oak grip',(.65,2.32,2.25),(.07,.08,.07),'darkwood',body,2)
for y in [-1.8,0,1.8]:
    beam('Cabin grab rail',(-.8,y,2.77),(.8,y,2.77),.025,'gold',body)
    for x in [-.55,.55]:ring('Leather hand loop',(x,y,2.6),.105,.018,'wood',body,(math.pi/2,0,0),12)
