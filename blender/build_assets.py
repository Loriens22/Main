"""Build Saltlight's original low-poly assets. Run: blender -b -t 2 --python blender/build_assets.py.

Blender Z is up, and the tram faces +Y (glTF converts it to Godot's -Z).
Assets are kept in named collections in the .blend and exported as small glTFs.
"""
import bpy, math, random, os
from mathutils import Vector
random.seed(71)
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "godot", "assets")
os.makedirs(OUT, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for col in list(bpy.data.collections):
    if col.name != "Collection": bpy.data.collections.remove(col)

def material(name, color, rough=.65, metallic=0, emission=0):
    # The art palette is specified in sRGB; Blender's node inputs are linear.
    color=tuple(c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4 for c in color)
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1)
    m.use_nodes=True; bs=m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value=(*color,1)
    bs.inputs['Roughness'].default_value=rough
    bs.inputs['Metallic'].default_value=metallic
    if emission:
        bs.inputs['Emission Color'].default_value=(*color,1)
        bs.inputs['Emission Strength'].default_value=emission
    return m

P={
 'green':material('Tram · deep bottle green',(0.055,.235,.175),.35,.12),
 'leaf':material('Hearth · enamel green',(.20,.38,.23),.4),
 'cream':material('Warm ivory',(.88,.81,.57)),
 'gold':material('Aged brass',(.68,.46,.18),.32,.65),
 'wood':material('Honey oak',(.43,.235,.12)),
 'darkwood':material('Walnut',(.14,.09,.065)),
 'glass':material('Dusky blue glass',(.115,.28,.33),.16,.2),
 'light':material('Lamplight', (1,.62,.20),.4,0,2),
 'black':material('Forged metal',(.065,.08,.085),.48,.5),
 'red':material('Terracotta',(.67,.235,.13)),
 'roof2':material('Tile highlights',(.82,.33,.19)),
 'plaster':material('Peach plaster',(.84,.60,.41)),
 'white':material('Salt white',(.87,.85,.72)),
 'blue':material('Blue shutters',(.11,.31,.38)),
 'yellow':material('Ochre plaster',(.89,.71,.38)),
 'pink':material('Rose plaster',(.78,.45,.36)),
 'skin':material('Warm skin',(.76,.49,.32)),
 'hair':material('Chestnut hair',(.18,.105,.06)),
 'shirt':material('Sea blue coat',(.16,.38,.43)),
 'scarf':material('Apricot scarf',(.91,.42,.18)),
 'green1':material('Olive leaves',(.30,.43,.18)),
 'green2':material('Sunlit leaves',(.43,.54,.25)),
 'green3':material('Deep leaves',(.15,.31,.19)),
 'grass':material('Island grass',(.40,.48,.28)),
}
ROCK=[material('Rock facet '+str(i),c) for i,c in enumerate([
 (.43,.42,.50),(.50,.46,.50),(.57,.47,.46),(.38,.40,.48),(.63,.52,.47),(.46,.39,.42)])]

def empty(name, parent=None):
    o=bpy.data.objects.new(name,None); bpy.context.collection.objects.link(o); o.parent=parent
    return o
def assign(o,mat,parent,name):
    o.name=name; o.data.materials.append(P[mat] if isinstance(mat,str) else mat); o.parent=parent
    return o
def box(name,loc,size,mat,parent,bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc)
    o=bpy.context.object; o.scale=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:
        mod=o.modifiers.new('Soft handmade edges','BEVEL'); mod.width=bevel;mod.segments=2
        bpy.ops.object.modifier_apply(modifier=mod.name)
        o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
    return assign(o,mat,parent,name)
def cyl(name,loc,r,depth,mat,parent,vertices=10,rotation=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=depth,location=loc)
    o=bpy.context.object
    if rotation: o.rotation_euler=rotation
    return assign(o,mat,parent,name)
def ico(name,loc,size,mat,parent,sub=1):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=sub,radius=1,location=loc)
    o=bpy.context.object; o.scale=size
    return assign(o,mat,parent,name)
def mesh(name,vertices,faces,mat,parent):
    me=bpy.data.meshes.new(name);me.from_pydata(vertices,[],faces);me.update()
    o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o)
    return assign(o,mat,parent,name)
def beam(name,a,b,r,mat,parent):
    a,b=Vector(a),Vector(b);o=cyl(name,(a+b)/2,r,(b-a).length,mat,parent,8)
    o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();return o

ASSETS=[]
def asset(name):
    col=bpy.data.collections.new(name);bpy.context.scene.collection.children.link(col)
    bpy.context.view_layer.active_layer_collection=bpy.context.view_layer.layer_collection.children[col.name]
    root=empty(name);ASSETS.append((name,root,col));return root

# A timber-framed, curved-roof aerial tram. Each movable or upgradeable part is a named group.
tram=asset('tram')
body=empty('Body',tram)
box('Oak chassis',(0,0,.62),(2.45,6.15,.40),'wood',body,.15)
box('Green waist',(0,0,1.25),(2.30,5.95,.95),'green',body,.20)
box('Interior floor',(0,0,1.72),(2.12,5.70,.12),'darkwood',body)
for side in [-1,1]:
    box('Brass waistline',(side*1.17,0,1.63),(.06,5.8,.055),'gold',body,.015)
    box('Cream window sill',(side*1.18,0,1.79),(.1,5.7,.13),'cream',body,.035)
    for y in [-2.7,-1.8,-.9,0,.9,1.8,2.7]:
        box('Window mullion',(side*1.11,y,2.30),(.11,.105,1.13),'cream',body,.025)
    # Open middle windows show the seated passengers; glass panels appear at the ends.
    for y in [-2.25,2.25]:
        box('Blue glazed end window',(side*1.10,y,2.32),(.035,.74,.90),'glass',body,.09)
    box('Green striped awning',(side*1.21,0,2.91),(.34,5.65,.12),'leaf',body,.045)
    for y in [-2.5,-1.5,-.5,.5,1.5,2.5]:
        box('Awning ivory stripe',(side*1.21,y,2.925),(.35,.16,.125),'cream',body,.025)
for y in [-2.91,2.91]:
    box('Curved windshield',(0,y,2.34),(1.95,.11,1.07),'glass',body,.28)
    for x in [-1.03,0,1.03]:box('Front brass frame',(x,y,2.34),(.075,.14,1.15),'cream',body,.025)
    box('Front brass bumper',(0,y*1.06,.88),(2.55,.18,.18),'gold',body,.05)
    box('Service number',(0,y*1.011,1.35),(.72,.025,.33),'cream',body,.045)
    for x in [-.67,.67]:
        cyl('Lamp housing',(x,y*1.012,1.15),.18,.12,'gold',body,12,(math.pi/2,0,0))
        cyl('Lamp lens',(x,y*1.025,1.15),.135,.13,'light',body,12,(math.pi/2,0,0))
roof=empty('Roof',tram)
box('Rounded roof',(0,0,3.02),(2.55,6.23,.39),'cream',roof,.19)
box('Roof cap',(0,0,3.22),(2.10,5.73,.13),'wood',roof,.06)
for y,name in [(-1.25,'Door_Rear'),(1.25,'Door_Front')]:
    door=empty(name,tram)
    # Doors slide longitudinally at station stops.
    box('Door panel',(1.18,y,2.05),(.09,.72,1.64),'green',door,.08)
    box('Door window',(1.23,y,2.40),(.03,.53,.69),'glass',door,.09)
    box('Door handle',(1.26,y-.22,1.96),(.06,.04,.23),'gold',door,.02)
for x in [-1,1]:
    for y in [-2,2]:
        wheel=empty('Wheel_'+str(x)+'_'+str(y),tram)
        cyl('Steel wheel',(x,y,.42),.42,.18,'black',wheel,14,(0,math.pi/2,0))
        cyl('Wheel hub',(x*1.02,y,.42),.18,.20,'gold',wheel,12,(0,math.pi/2,0))
        beam('Oak bogie',(x,y-.52,.54),(x,y+.52,.54),.13,'darkwood',body)
passengers=empty('Passengers',tram)
for i,y in enumerate([-1.9,-.65,.65,1.9]):
    for side in [-1,1]:
        x=side*.62
        box('Bench',(x,y,1.89),(.57,.78,.18),'wood',body,.05)
        ico('Passenger coat',(x,y,2.19),(.23,.22,.31),'shirt' if i%2 else 'scarf',passengers,2)
        ico('Passenger head',(x,y,2.58),(.18,.17,.20),'skin',passengers,2)
        ico('Passenger hair',(x,y+.02,2.70),(.185,.18,.105),'hair',passengers,1)
        for xx in [-.08,.08]:box('Boot',(x+xx,y+.20,1.82),(.10,.21,.13),'black',passengers,.03)
satchel=empty('Satchel',tram)
box('Old travelling bag',(.15,1.65,3.48),(.65,.58,.40),'red',satchel,.07)
box('Old bag strap',(.15,1.65,3.48),(.08,.60,.42),'cream',satchel,.015)
box('Old bag handle',(.15,1.65,3.72),(.22,.055,.08),'gold',satchel,.025)
luggage=empty('Luggage',tram)
for x in [-.9,.9]:beam('Luggage rack',(x,-2.10,3.40),(x,1.6,3.40),.035,'gold',luggage)
for y in [-2,-1,0,1]:beam('Rack crossbar',(-.9,y,3.40),(.9,y,3.40),.035,'gold',luggage)
for i,(x,y,sz) in enumerate([(-.45,-1.45,(.72,.85,.47)),(.38,-.55,(.85,.64,.55)),(-.28,.65,(.68,.88,.35))]):
    box('Leather suitcase',(x,y,3.48+sz[2]/2),sz,'wood' if i%2 else 'red',luggage,.065)
    for xx in [-.20,.20]:box('Suitcase strap',(x+xx,y,3.48+sz[2]/2),(.04,sz[1]+.015,sz[2]+.015),'cream',luggage,.015)
    box('Suitcase handle',(x,y,3.48+sz[2]+.04),(.22,.05,.08),'gold',luggage,.025)
vines=empty('Vines',tram)
for side in [-1,1]:
    for i in range(24):
        y=-2.65+i*.23;z=2.87-.20*math.sin(i*.60)
        ico('Hearth leaf',(side*1.31,y,z),(.075,.15,.12),'green1' if i%2 else 'green2',vines,1)
    for y in [-2.6,2.6]:
        for i in range(6):ico('Trailing ivy',(side*1.20,y,2.9-i*.13),(.10,.12,.12),'green1',vines)
lanterns=empty('Lanterns',tram)
for side in [-1,1]:
    for y in [-2.5,2.5]:
        beam('Lantern hook',(side*1.22,y,2.8),(side*1.43,y,2.7),.03,'gold',lanterns)
        box('Lantern glow',(side*1.44,y,2.46),(.18,.18,.28),'light',lanterns,.035)
        for zz in [2.28,2.64]:box('Lantern cap',(side*1.44,y,zz),(.26,.26,.07),'black',lanterns,.03)

# Small houses with individual roof tiles, shutters, chimneys and warm windows.
for k,wall in enumerate(['plaster','yellow','white','pink']):
    root=asset('house_'+str(k));g=empty('House',root)
    h=3.3+.22*k
    box('Plaster house',(0,0,h/2),(4.2,4.7,h),wall,g,.075)
    box('Stone footing',(0,0,.13),(4.42,4.88,.26),'cream',g,.035)
    mesh('Gable',[(-2.1,-2.35,h),(2.1,-2.35,h),(0,-2.35,h+1.65),(-2.1,2.35,h),(2.1,2.35,h),(0,2.35,h+1.65)],[(0,1,2),(3,5,4)],wall,g)
    mesh('Red roof',[(-2.45,-2.65,h),(0,-2.65,h+1.8),(2.45,-2.65,h),(-2.45,2.65,h),(0,2.65,h+1.8),(2.45,2.65,h)],[(0,3,4,1),(1,4,5,2)],'red',g)
    for side in [-1,1]:
        for row in range(6):
            x=side*(row+.5)*.40;zz=h+1.8-abs(x)*1.8/2.45
            for j in range(8):
                o=box('Terracotta tile',(x,-2.3+j*.65,zz+.06),(.44,.61,.12),'roof2' if (j+row)%4==0 else 'red',g,.04)
                o.rotation_euler[1]=side*math.atan(1.8/2.45)
    cyl('Roof ridge',(0,0,h+1.87),.12,5.5,'roof2',g,10,(math.pi/2,0,0))
    box('Chimney',(1.35,.65,h+1.7),(.53,.60,1.5),'white',g,.025)
    box('Chimney cap',(1.35,.65,h+2.43),(.74,.79,.16),'red',g,.035)
    for y in [-2.38,2.38]:
        for x in [-1.12,1.12]:
            box('Window border',(x,y,h*.66),(1.05,.12,1.26),'cream',g,.075)
            box('Warm window',(x,y*1.009,h*.66),(.83,.15,1.03),'light',g,.055)
            box('Window vertical',(x,y*1.017,h*.66),(.07,.16,1.08),'wood',g)
            box('Window crossbar',(x,y*1.017,h*.66),(.85,.16,.07),'wood',g)
            for xx in [-.62,.62]:box('Blue shutter',(x+xx,y,h*.66),(.24,.14,1.20),'blue',g,.025)
            box('Window planter',(x,y*1.06,h*.66-.68),(1.17,.30,.20),'wood',g,.035)
            for ii in range(5):ico('Window flowers',(x-.45+ii*.22,y*1.075,h*.66-.54),(.15,.12,.15),'green2',g)
    box('Front door',(0,2.4,.87),(.72,.14,1.70),'blue',g,.10)
    ico('Door brass knob',(.22,2.49,.88),(.045,.045,.045),'gold',g,2)
    box('Door step',(0,2.65,.12),(1.15,.56,.24),'cream',g,.055)

root=asset('tree');g=empty('Olive tree',root)
cyl('Crooked trunk',(0,0,1.5),.20,3.0,'wood',g,7)
for i,(x,y,z) in enumerate([(-1,0,3),(.75,.4,3.6),(0,-.65,3.45),(0,0,4.15)]):
    beam('Branch',(0,0,1.8),(x,y,z),.10,'wood',g)
    ico('Olive crown',(x,y,z),(1.4,1.15,1.3),['green1','green2','green3'][i%3],g,2)
root=asset('cypress');g=empty('Cypress',root)
cyl('Cypress trunk',(0,0,1),.14,2,'wood',g,7)
for i in range(4):
    bpy.ops.mesh.primitive_cone_add(vertices=9,radius1=.82-i*.13,radius2=.20-i*.035,depth=2.1,location=(0,0,1.7+i*.70))
    assign(bpy.context.object,'green3' if i%2 else 'green1',g,'Cypress crown')

root=asset('lighthouse');g=empty('Saltlight tower',root)
cyl('Tower footing',(0,0,.3),2.3,.6,'cream',g,12)
bpy.ops.mesh.primitive_cone_add(vertices=12,radius1=1.7,radius2=1.15,depth=11,location=(0,0,5.8))
assign(bpy.context.object,'white',g,'Tapered white tower')
for z in [2.8,6.3,9.8]:cyl('Terracotta stripe',(0,0,z),1.72-(z-.3)*.05,.42,'red',g,12)
cyl('Gallery deck',(0,0,11.4),1.85,.27,'cream',g,12)
cyl('Lantern chamber',(0,0,12.25),1.10,1.5,'glass',g,12)
cyl('Lighthouse beacon',(0,0,12.35),.47,.85,'light',g,12)
for i in range(12):
    a=i*math.tau/12;beam('Gallery rail post',(1.6*math.cos(a),1.6*math.sin(a),11.5),(1.6*math.cos(a),1.6*math.sin(a),12.15),.035,'black',g)
    beam('Chamber mullion',(1.1*math.cos(a),1.1*math.sin(a),11.55),(1.1*math.cos(a),1.1*math.sin(a),13),.045,'cream',g)
bpy.ops.mesh.primitive_cone_add(vertices=12,radius1=1.7,radius2=0,depth=1.35,location=(0,0,13.65))
assign(bpy.context.object,'red',g,'Lantern roof')
box('Tower doorway',(0,-1.72,1.05),(.75,.10,1.6),'blue',g,.10)

# Irregular rocky floating island, one shared mesh with individually coloured facets.
root=asset('island');g=empty('Island',root)
N=22;verts=[]
profiles=[(21,0),(24,-4),(19,-14),(10,-24),(3,-30)]
outline=[random.uniform(.88,1.12) for _ in range(N)]
for ring,(radius,z) in enumerate(profiles):
    for i in range(N):
        a=i*math.tau/N;rr=radius*outline[i]*(random.uniform(.95,1.05) if ring else 1)
        verts.append((math.cos(a)*rr,math.sin(a)*rr,z+(random.uniform(-1.3,1.3) if ring else 0)))
verts.append((0,0,0));faces=[]
for i in range(N):faces.append((N*5,i,(i+1)%N))
for r in range(4):
    for i in range(N):
        a=r*N+i;b=r*N+(i+1)%N;c=(r+1)*N+i;d=(r+1)*N+(i+1)%N
        faces.extend([(a,c,b),(b,c,d)])
faces.append(tuple(range(N*4,N*5)))
o=mesh('Faceted floating rock',verts,faces,'grass',g)
for m in ROCK:o.data.materials.append(m)
for i,poly in enumerate(o.data.polygons):poly.material_index=0 if i<N else random.randint(1,len(ROCK))

root=asset('townsfolk');g=empty('Waiting passenger',root)
for x in [-.12,.12]:
    box('Trouser leg',(x,0,.30),(.14,.18,.52),'blue',g,.025)
    box('Boot',(x,-.065,.075),(.18,.29,.15),'darkwood',g,.04)
ico('Coat',(0,0,.78),(.32,.24,.43),'shirt',g,2)
ico('Head',(0,0,1.28),(.22,.21,.25),'skin',g,2)
ico('Hair',(0,.03,1.42),(.23,.22,.14),'hair',g,1)
cyl('Straw hat',(0,0,1.55),.34,.075,'cream',g,12)
cyl('Hat crown',(0,0,1.63),.23,.15,'cream',g,12)
box('Scarf',(0,-.22,1.01),(.35,.07,.10),'scarf',g,.025)
for x in [-.34,.34]:
    beam('Arm',(x*.9,0,.95),(x,-.08,.60),.075,'shirt',g)
    ico('Hand',(x,-.08,.57),(.08,.08,.10),'skin',g)
box('Travel bag',(.45,.02,.46),(.28,.25,.36),'wood',g,.04)

# Join pieces within named groups to keep browser draw calls economical.
for name,root,col in ASSETS:
    for group in [o for o in col.objects if o.type=='EMPTY']:
        children=[o for o in group.children if o.type=='MESH']
        if not children: continue
        bpy.ops.object.select_all(action='DESELECT')
        for o in children:o.select_set(True)
        bpy.context.view_layer.objects.active=children[0]
        bpy.ops.object.join();children[0].name=group.name+'Mesh'
    bpy.ops.object.select_all(action='DESELECT')
    for o in col.objects:o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,name+'.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_cameras=False,export_lights=False)
    # Lay out the editable source library; exported assets remain at local origin.
    idx=len([a for a in ASSETS if a[0]<name]);root.location=(ASSETS.index((name,root,col))*10,0,0)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'blender','saltlight_assets.blend'))
print('SALTLight: exported',len(ASSETS),'original assets to',OUT)
