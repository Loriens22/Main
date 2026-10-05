extends Node3D
## Original Blender meshes form the town; instancing keeps the railway and clouds economical.

const TRAM = preload("res://assets/tram.glb")
const ISLAND = preload("res://assets/island.glb")
const TREE = preload("res://assets/tree.glb")
const CYPRESS = preload("res://assets/cypress.glb")
const LIGHTHOUSE = preload("res://assets/lighthouse.glb")
const FOLK = preload("res://assets/townsfolk.glb")
const HOUSES = [preload("res://assets/house_0.glb"), preload("res://assets/house_1.glb"), preload("res://assets/house_2.glb"), preload("res://assets/house_3.glb")]

var curve = Curve3D.new()
var length = 0.0
var stations = []
var waiting = [[], []]
var cloud_node: MultiMeshInstance3D
var gulls = []
var beacon: Node3D
var shop_tram: Node3D
var crane: Node3D
var workshop = Vector3(0, 22, 280)
var rng = RandomNumberGenerator.new()
var mats = {}
var t = 0.0
var compact_assets = {}
var pending_boxes = {}
var vertex_material: StandardMaterial3D
var vertex_glow: StandardMaterial3D
var sunlight: DirectionalLight3D
var static_instances = []

func _ready():
	rng.seed = 719
	mats.oak = paint(Color("8f633f"))
	mats.rail = paint(Color("bcb9a4"), 0.55)
	mats.stone = paint(Color("c8b696"))
	mats.green = paint(Color("204e42"))
	mats.brass = paint(Color("bc955c"), 0.5)
	mats.tile = paint(Color("ae5037"))
	mats.cream = paint(Color("ebdcae"))
	mats.glow = paint(Color("ffc777"), 0.0, true)
	vertex_material=paint(Color.WHITE)
	vertex_material.vertex_color_use_as_albedo=true
	vertex_material.vertex_color_is_srgb=true
	vertex_glow=paint(Color.WHITE)
	vertex_glow.vertex_color_use_as_albedo=true
	vertex_glow.vertex_color_is_srgb=true
	vertex_glow.emission_enabled=true
	vertex_glow.emission=Color("ffbe65")
	vertex_glow.emission_energy_multiplier=.7
	build_atmosphere()
	build_curve()
	build_railway()
	build_town(Vector3(-105, 19, 4), 0)
	build_town(Vector3(112, 23, -33), 1)
	build_distant_islands()
	build_workshop()
	build_gulls()
	flush_boxes()

func paint(color: Color, metal = 0.0, glow = false) -> StandardMaterial3D:
	var m = StandardMaterial3D.new()
	m.albedo_color = color
	m.roughness = 0.7 if metal == 0 else 0.4
	m.metallic = metal
	if glow:
		m.emission_enabled = true
		m.emission = color
		m.emission_energy_multiplier = 1.4
	return m

func box(parent: Node3D, p: Vector3, size: Vector3, mat: Material) -> MeshInstance3D:
	# Static blocks share a few draw calls. The moving workshop crane stays separate.
	if parent!=crane:
		var key=mat.get_instance_id()
		if not pending_boxes.has(key):pending_boxes[key]={"material":mat,"transforms":[]}
		pending_boxes[key].transforms.append(parent.global_transform*Transform3D(Basis.IDENTITY.scaled(size),p))
		return null
	var n = MeshInstance3D.new()
	var mesh = BoxMesh.new()
	mesh.size = size
	mesh.material = mat
	n.mesh = mesh
	n.position = p
	parent.add_child(n)
	return n

func piece(scene: PackedScene, parent: Node3D, p: Vector3, size = 1.0, yaw = 0.0) -> Node3D:
	var n = scene.instantiate()
	if scene!=TRAM:
		for child in n.find_children("*","MeshInstance3D",true,false):
			var key=child.mesh.get_instance_id()
			if not compact_assets.has(key):compact_assets[key]=compact_mesh(child.mesh)
			child.mesh=compact_assets[key]
			static_instances.append(child)
	parent.add_child(n)
	n.position = p
	n.scale = Vector3.ONE * size
	n.rotation.y = yaw
	return n

func compact_mesh(original: Mesh) -> ArrayMesh:
	# Preserve the Blender palette and normals while folding static surfaces into vertex colours.
	# Windows keep an emissive surface. Each source asset is baked only once and reused.
	var result=ArrayMesh.new()
	for glowing in [false,true]:
		var vertices=PackedVector3Array()
		var normals=PackedVector3Array()
		var colors=PackedColorArray()
		var indices=PackedInt32Array()
		var lods={}
		for edge in [.08,.25,.6,1.2,2.5]:lods[edge]=PackedInt32Array()
		for s in range(original.get_surface_count()):
			var m=original.surface_get_material(s)
			if bool(m.emission_enabled)!=glowing:continue
			var source=original.surface_get_arrays(s)
			var offset=vertices.size()
			var points=source[Mesh.ARRAY_VERTEX]
			vertices.append_array(points)
			normals.append_array(source[Mesh.ARRAY_NORMAL])
			var col=PackedColorArray()
			col.resize(points.size())
			col.fill(m.albedo_color)
			colors.append_array(col)
			var source_indices=source[Mesh.ARRAY_INDEX]
			if source_indices and source_indices.size()>0:
				for index in source_indices:indices.append(index+offset)
			else:
				for index in range(points.size()):indices.append(index+offset)
			# Keep Godot's imported levels of detail after merging the colour surfaces.
			var raw=RenderingServer.mesh_get_surface(original.get_rid(),s)
			var stride=2 if points.size()<65536 else 4
			var decoded={}
			for edge in lods.keys():
				var chosen=source_indices
				for level in raw.get("lods",[]):
					if level.edge_length>edge:break
					if not decoded.has(level.edge_length):
						var bytes=level.index_data
						var reduced=PackedInt32Array()
						reduced.resize(bytes.size()/stride)
						for j in range(reduced.size()):reduced[j]=bytes.decode_u16(j*2) if stride==2 else bytes.decode_u32(j*4)
						decoded[level.edge_length]=reduced
					chosen=decoded[level.edge_length]
				if chosen and chosen.size()>0:
					for index in chosen:lods[edge].append(index+offset)
				else:
					for index in range(points.size()):lods[edge].append(index+offset)
		if vertices.is_empty():continue
		var arrays=[]
		arrays.resize(Mesh.ARRAY_MAX)
		arrays[Mesh.ARRAY_VERTEX]=vertices
		arrays[Mesh.ARRAY_NORMAL]=normals
		arrays[Mesh.ARRAY_COLOR]=colors
		arrays[Mesh.ARRAY_INDEX]=indices
		for edge in lods.keys():
			if lods[edge].is_empty() or lods[edge].size()>=indices.size():lods.erase(edge)
		result.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES,arrays,[],lods)
		result.surface_set_material(result.get_surface_count()-1,vertex_glow if glowing else vertex_material)
	return result

func flush_boxes():
	for group in pending_boxes.values():
		var mesh=BoxMesh.new()
		mesh.size=Vector3.ONE
		mesh.material=group.material
		var n=multi(mesh,group.transforms.size(),true)
		for i in range(group.transforms.size()):n.multimesh.set_instance_transform(i,group.transforms[i])
	pending_boxes.clear()

func build_atmosphere():
	var env = WorldEnvironment.new()
	var e = Environment.new()
	e.background_mode = Environment.BG_SKY
	var sky = Sky.new()
	var shader = Shader.new()
	shader.code = """shader_type sky;
void sky() {
  float y = EYEDIR.y;
  vec3 horizon = vec3(.52, .44, .59);
  vec3 twilight = vec3(.23, .29, .49);
  vec3 night = vec3(.10, .15, .31);
  vec3 c = mix(horizon, twilight, smoothstep(-.08,.23,y));
  c = mix(c, night, smoothstep(.17,.8,y));
  vec3 sun = normalize(vec3(-.55,.17,-.8));
  float d = dot(EYEDIR,sun);
  c += vec3(.7,.4,.16)*pow(max(d,0.),32.)*.33;
  c += vec3(1.,.73,.41)*smoothstep(.9985,.9992,d)*.9;
  COLOR = c;
}"""
	var sm = ShaderMaterial.new()
	sm.shader = shader
	sky.sky_material = sm
	sky.radiance_size = Sky.RADIANCE_SIZE_128
	e.sky = sky
	e.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	e.ambient_light_color = Color("afbad6")
	e.ambient_light_energy = 0.42
	e.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	e.fog_enabled = true
	e.fog_light_color = Color("7b87a9")
	e.fog_density = 0.001
	e.fog_sky_affect = 0.12
	env.environment = e
	add_child(env)
	var sun = DirectionalLight3D.new()
	sunlight=sun
	sun.rotation_degrees = Vector3(-25, -37, 0)
	sun.light_color = Color("ffd4a4")
	sun.light_energy = 0.83
	sun.shadow_enabled = true
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_2_SPLITS
	sun.directional_shadow_max_distance = 115
	add_child(sun)
	var fill = DirectionalLight3D.new()
	fill.rotation_degrees = Vector3(-40, 140, 0)
	fill.light_color = Color("aaaee3")
	fill.light_energy = .16
	add_child(fill)
	var ocean = MeshInstance3D.new()
	var plane = PlaneMesh.new()
	plane.size = Vector2(4000,4000)
	plane.subdivide_width = 80
	plane.subdivide_depth = 80
	ocean.mesh = plane
	ocean.position.y = -58
	var water = Shader.new()
	water.code = """shader_type spatial;
render_mode specular_schlick_ggx;
varying vec3 world;
void vertex(){ VERTEX.y += sin(VERTEX.x*.025+TIME*.35)*.8 + cos(VERTEX.z*.031+TIME*.2)*.65; world=VERTEX; }
void fragment(){
 float ripple = sin(world.x*.18+TIME*.4)*sin(world.z*.11-TIME*.3);
 float stripes = smoothstep(.82,1.,sin(world.x*.033+world.z*.07+TIME*.15));
 ALBEDO = mix(vec3(.065,.28,.35),vec3(.18,.44,.48),ripple*.5+.5);
 ALBEDO += vec3(.20,.14,.07)*stripes*.35;
 ROUGHNESS=.38; METALLIC=.22;
}"""
	var wm = ShaderMaterial.new()
	wm.shader = water
	ocean.material_override = wm
	add_child(ocean)
	# Opaque low-poly cloud lobes avoid expensive transparent depth sorting.
	var cloud_mesh = SphereMesh.new()
	cloud_mesh.radial_segments = 12
	cloud_mesh.rings = 6
	cloud_mesh.radius = 1
	cloud_mesh.height = 2
	cloud_mesh.material = paint(Color("c7c3d9"))
	cloud_node = multi(cloud_mesh, 360, false, true)
	for i in range(120):
		var center = Vector3(rng.randf_range(-600,600), rng.randf_range(-24,-9), rng.randf_range(-620,560))
		for j in range(3):
			var pos = center + Vector3(j*12-12, rng.randf_range(-2,3), rng.randf_range(-5,5))
			var sc = Vector3(rng.randf_range(17,35),rng.randf_range(5,11),rng.randf_range(13,27))
			cloud_node.multimesh.set_instance_transform(i*3+j, Transform3D(Basis.IDENTITY.scaled(sc),pos))
			cloud_node.multimesh.set_instance_color(i*3+j, Color(1,1,1).lerp(Color("9babc9"),rng.randf()*.35))
	var star = SphereMesh.new()
	star.radius = .38
	star.height = .76
	star.radial_segments = 4
	star.rings = 2
	var starmat = paint(Color("fbe8c3"),0,true)
	starmat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	star.material = starmat
	var stars = multi(star, 300)
	for i in range(300):
		var a = rng.randf()*TAU
		var h = rng.randf_range(.12,1.25)
		var pos = Vector3(cos(a)*cos(h),sin(h),sin(a)*cos(h))*700
		stars.multimesh.set_instance_transform(i,Transform3D(Basis.IDENTITY.scaled(Vector3.ONE*rng.randf_range(.5,1.8)),pos))

func multi(mesh: Mesh, count: int, shadows = false, colors = false) -> MultiMeshInstance3D:
	var n = MultiMeshInstance3D.new()
	var mm = MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_colors = colors
	mm.mesh = mesh
	mm.instance_count = count
	n.multimesh = mm
	n.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if shadows else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(n)
	return n

func build_curve():
	# Catmull–Rom tangents converted to cubic Bezier handles, closing one continuous railway.
	var pts = [Vector3(-100,21,28),Vector3(-67,21,28),Vector3(-31,26,49),Vector3(6,36,34),Vector3(39,38,-4),Vector3(80,25,-10),Vector3(112,25,-10),Vector3(142,25,-10),Vector3(146,29,-54),Vector3(91,37,-95),Vector3(20,34,-100),Vector3(-63,29,-72),Vector3(-140,24,-15),Vector3(-130,21,28)]
	curve.bake_interval = .4
	for i in range(pts.size()+1):
		var j = i%pts.size()
		var tangent = (pts[(j+1)%pts.size()]-pts[posmod(j-1,pts.size())])/6.0
		curve.add_point(pts[j],-tangent,tangent)
	length = curve.get_baked_length()
	var mango_dist = 0.0
	var nearest = INF
	for i in range(int(length/.25)):
		var d = float(i)*.25
		var gap = curve.sample_baked(d).distance_squared_to(pts[6])
		if gap<nearest:
			nearest=gap
			mango_dist=d
	stations = [{"name":"Saltlight Terminus","distance":0.0,"point":pts[0]}, {"name":"Mango Tide","distance":mango_dist,"point":pts[6]}]

func frame(distance: float) -> Transform3D:
	var d = fposmod(distance,length)
	var p = curve.sample_baked(d,true)
	var ahead = curve.sample_baked(fposmod(d+.6,length),true)
	var behind = curve.sample_baked(fposmod(d-.6,length),true)
	return Transform3D(Basis.looking_at((ahead-behind).normalized(),Vector3.UP),p)

func build_railway():
	# Sleeper geometry is instanced; both shining rails are continuous polygon tubes.
	var sleeper = BoxMesh.new()
	sleeper.size = Vector3(2.4,.17,.23)
	sleeper.material = mats.oak
	var count = int(length/1.1)
	var ties = multi(sleeper,count,true)
	for i in range(count):
		var tr = frame(float(i)*length/count)
		tr.origin.y -= .06
		ties.multimesh.set_instance_transform(i,tr)
	for side in [-1.0,1.0]:
		var st = SurfaceTool.new()
		st.begin(Mesh.PRIMITIVE_TRIANGLES)
		var segments = int(length/.7)
		for i in range(segments):
			var f1 = frame(float(i)*length/segments)
			var f2 = frame(float(i+1)*length/segments)
			for j in range(6):
				var a = float(j)*TAU/6
				var b = float(j+1)*TAU/6
				var la = Vector3(side*.70+cos(a)*.07,.12+sin(a)*.08,0)
				var lb = Vector3(side*.70+cos(b)*.07,.12+sin(b)*.08,0)
				for v in [f1*la,f2*la,f1*lb,f1*lb,f2*la,f2*lb]:st.add_vertex(v)
		st.generate_normals()
		var n=MeshInstance3D.new()
		n.mesh=st.commit()
		n.material_override=mats.rail
		add_child(n)
	# A timber viaduct and regularly braced towers carry the line across the clouds.
	var beam_mesh=BoxMesh.new()
	beam_mesh.size=Vector3.ONE
	beam_mesh.material=mats.oak
	var support_count=int(length/24)
	var supports=multi(beam_mesh,support_count*5,true)
	for i in range(support_count):
		var f=frame(float(i)*24)
		var p=f.origin
		var right=f.basis.x
		var bottom=p.y-16.0
		var height=p.y-bottom
		for j in range(2):
			var signside=float(j)*2-1
			var pos=p+right*signside*1.3-Vector3(0,height/2,0)
			supports.multimesh.set_instance_transform(i*5+j,Transform3D(f.basis.scaled(Vector3(.50,height,.65)),pos))
		var cap=Transform3D(f.basis.scaled(Vector3(4.4,.40,.70)),p-Vector3(0,.36,0))
		supports.multimesh.set_instance_transform(i*5+2,cap)
		for j in range(2):
			var a=p+right*(float(j)*2-1)*1.3-Vector3(0,5,0)
			var b=p+right*(1-float(j)*2)*1.3-Vector3(0,.8,0)
			var dir=(b-a)
			var basis=Basis.looking_at(dir.normalized(),Vector3.UP).scaled(Vector3(.18,.18,dir.length()))
			supports.multimesh.set_instance_transform(i*5+3+j,Transform3D(basis,(a+b)/2))
		# Small floating rock anchors carry the trestles, keeping the line light above the sea.
		var anchor=piece(ISLAND,self,Vector3(p.x,bottom,p.z),.11)
		anchor.scale=Vector3(.14,.13,.12)
	# Long under-rail stringers visually connect the bridge towers.
	for side in [-1.0,1.0]:
		var st=SurfaceTool.new()
		st.begin(Mesh.PRIMITIVE_TRIANGLES)
		var seg=int(length/1.4)
		for i in range(seg):
			var a=frame(float(i)*length/seg)
			var b=frame(float(i+1)*length/seg)
			var cross=[Vector3(side*.9-.12,-.25,0),Vector3(side*.9+.12,-.25,0),Vector3(side*.9+.12,-.8,0),Vector3(side*.9-.12,-.8,0)]
			for j in range(4):
				for v in [a*cross[j],a*cross[(j+1)%4],b*cross[j],b*cross[j],a*cross[(j+1)%4],b*cross[(j+1)%4]]:st.add_vertex(v)
		st.generate_normals()
		var n=MeshInstance3D.new()
		n.mesh=st.commit()
		n.material_override=mats.oak
		add_child(n)

func build_town(center: Vector3, idx: int):
	var island=piece(ISLAND,self,center,1)
	island.scale=Vector3(1.58,.85,1.58)
	island.rotation.y=.25 if idx==0 else -.3
	box(self,center+Vector3(0,.02,0),Vector3(5,.04,38),mats.stone)
	box(self,center+Vector3(0,.025,7),Vector3(38,.05,3),mats.stone)
	var layout=[Vector3(-10,0,-12),Vector3(-10,0,-3),Vector3(-11,0,9),Vector3(9,0,-13),Vector3(11,0,-3),Vector3(11,0,8),Vector3(-22,0,0),Vector3(22,0,-3),Vector3(0,0,-19),Vector3(-19,0,-12)]
	for i in range(layout.size()):
		piece(HOUSES[(i+idx)%4],self,center+layout[i],rng.randf_range(.9,1.20),PI if i%2 else 0)
	for p in [Vector3(-21,0,11),Vector3(21,0,11),Vector3(-4,0,-13),Vector3(4,0,1),Vector3(17,0,-15),Vector3(-18,0,18),Vector3(17,0,18),Vector3(5,0,-24)]:
		piece(TREE,self,center+p,rng.randf_range(.85,1.25),rng.randf()*TAU)
	for p in [Vector3(-5,0,6),Vector3(5,0,6),Vector3(-5,0,-5),Vector3(5,0,-5),Vector3(-23,0,-5),Vector3(23,0,3)]:piece(CYPRESS,self,center+p,1.1)
	piece(LIGHTHOUSE,self,center+Vector3(-22 if idx==0 else 23,0,-9),1.1)
	for x in [-4.0,4.0]:
		for z in [-9.0,3.0,15.0]:lamp(self,center+Vector3(x,0,z))
	# A quiet harbour landing juts out over the ocean below the railway.
	for i in range(16):box(self,center+Vector3(-18,-.18,23+i*.55),Vector3(3.1,.16,.47),mats.oak)
	for z in [24,28,31]:
		for x in [-19.2,-16.8]:box(self,center+Vector3(x,-1,z),Vector3(.22,2,.22),mats.oak)
	build_station(idx)

func lamp(parent: Node3D, p: Vector3):
	box(parent,p+Vector3(0,1.7,0),Vector3(.09,3.4,.09),mats.green)
	box(parent,p+Vector3(0,3.47,0),Vector3(.35,.48,.35),mats.glow)
	box(parent,p+Vector3(0,3.76,0),Vector3(.48,.12,.48),mats.green)

func label(parent: Node3D, text: String, p: Vector3, size=40, color=Color("f4deb0")) -> Label3D:
	var l=Label3D.new()
	l.text=text
	l.position=p
	l.font_size=size
	l.pixel_size=.012
	l.modulate=color
	l.outline_size=0
	l.no_depth_test=false
	parent.add_child(l)
	return l

func build_station(idx: int):
	var root=Node3D.new()
	root.position=stations[idx].point
	add_child(root)
	box(root,Vector3(0,.55,4.0),Vector3(23,.8,5.2),mats.stone)
	box(root,Vector3(0,.98,1.45),Vector3(23,.06,.15),mats.cream)
	for x in [-9,-3,3,9]:
		box(root,Vector3(x,2.55,6.1),Vector3(.16,3.2,.16),mats.green)
	box(root,Vector3(0,4.18,6.1),Vector3(23,.22,1.8),mats.tile)
	box(root,Vector3(0,3.45,7.0),Vector3(5.7,.95,.16),mats.green)
	label(root,"SALTLIGHT TERMINUS" if idx==0 else "MANGO TIDE",Vector3(0,3.47,7.10),32)
	for x in [-9.5,9.5]:
		lamp(root,Vector3(x,.96,2.8))
		box(root,Vector3(x,1.4,3.1),Vector3(2.2,.15,.65),mats.oak)
	for i in range(6):
		var f=piece(FOLK,root,Vector3(-5.4+i*1.5,.97,3.1),.91,PI*.5)
		waiting[idx].append({"node":f,"home":f.position,"seed":rng.randf()*TAU})
	# Stairs down to the village footpath.
	for i in range(5):box(root,Vector3(-11-i*.4,.75-i*.23,4),Vector3(.5,.25,2),mats.stone)

func build_distant_islands():
	var positions = [Vector3(290,12,-245),Vector3(-340,27,-210),Vector3(280,38,230),Vector3(-320,5,240)]
	for i in range(positions.size()):
		var p = positions[i]
		var island=piece(ISLAND,self,p,.9)
		island.rotation.y=float(i)
		piece(HOUSES[i],self,p+Vector3(4,0,0),.9)
		piece(HOUSES[(i+1)%4],self,p+Vector3(-5,0,-5),.8)
		piece(TREE,self,p+Vector3(-8,0,6),1.3)
		if i==0:piece(LIGHTHOUSE,self,p+Vector3(9,0,-7),.8)
		var ring=MeshInstance3D.new()
		var torus=TorusMesh.new()
		torus.inner_radius=42
		torus.outer_radius=42.13
		torus.rings=72
		torus.ring_segments=4
		ring.mesh=torus
		ring.material_override=mats.brass
		ring.position=p+Vector3(0,-4,0)
		ring.rotation=Vector3(.15,0,.12)
		add_child(ring)

func build_workshop():
	var base=piece(ISLAND,self,workshop-Vector3(0,1,0),1.0)
	base.scale=Vector3(1.35,.75,1.25)
	box(self,workshop-Vector3(0,.15,0),Vector3(15,.25,18),mats.stone)
	box(self,workshop+Vector3(-6,2,-1),Vector3(.22,4,13),mats.green)
	box(self,workshop+Vector3(0,2,-7),Vector3(12,4,.22),mats.green)
	for x in [-5.8,5.8]:
		for z in [-7,5]:box(self,workshop+Vector3(x,2.3,z),Vector3(.25,4.6,.25),mats.oak)
	box(self,workshop+Vector3(-4.6,4.65,-1),Vector3(3.3,.22,13.5),mats.tile)
	box(self,workshop+Vector3(0,4.6,-7),Vector3(12,.27,.3),mats.oak)
	box(self,workshop+Vector3(0,4.5,5),Vector3(12,.32,.4),mats.oak)
	label(self,"OLIVER'S\nCLOUDWORKS",workshop+Vector3(-4,2.7,5.7),28)
	# Open roof lets the isometric camera see the tram and Oliver at work.
	shop_tram=piece(TRAM,self,workshop+Vector3(0,.1,-.5),1.0,PI)
	for i in range(16):box(self,workshop+Vector3(0,0,-9+i*1.2),Vector3(2.8,.1,.2),mats.oak)
	for x in [-.7,.7]:box(self,workshop+Vector3(x,.12,0),Vector3(.09,.12,24),mats.rail)
	box(self,workshop+Vector3(-4.65,1,-2.5),Vector3(1.9,.18,4.6),mats.oak)
	for z in [-4,-1]:
		for x in [-5.3,-4]:box(self,workshop+Vector3(x,.5,z),Vector3(.12,1,.12),mats.oak)
	for i in range(8):
		box(self,workshop+Vector3(-4.5+sin(i)*.55,1.18,-4+i*.45),Vector3(.18,.20,.35),mats.brass if i%2 else mats.green)
	for z in [-5,-2,1]:
		box(self,workshop+Vector3(-5.9,2,z),Vector3(.25,.2,1.4),mats.oak)
		box(self,workshop+Vector3(-5.75,2.3,z),Vector3(.4,.5,.6),mats.cream)
	piece(FOLK,self,workshop+Vector3(-3.2,0,1),1.2,-PI*.5)
	piece(HOUSES[2],self,workshop+Vector3(-13,0,-9),1.35,PI*.25)
	for p in [Vector3(-15,0,8),Vector3(12,0,-7),Vector3(13,0,5),Vector3(-8,0,13)]:piece(TREE,self,workshop+p,1.5)
	for p in [Vector3(-4,0,8),Vector3(4,0,8)]:lamp(self,workshop+p)
	crane=Node3D.new()
	add_child(crane)
	crane.position=workshop+Vector3(0,4.8,-1)
	box(crane,Vector3(0,0,0),Vector3(9,.24,.25),mats.brass)
	box(crane,Vector3(0,-.8,0),Vector3(.055,1.6,.055),mats.green)
	box(crane,Vector3(0,-1.65,0),Vector3(.35,.10,.35),mats.brass)

func build_gulls():
	var st=SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	for v in [Vector3(-.7,0,0),Vector3(0,-.12,.05),Vector3(-.25,.03,-.2),Vector3(0,-.12,.05),Vector3(.7,0,0),Vector3(.25,.03,-.2)]:st.add_vertex(v)
	st.generate_normals()
	var mesh=st.commit()
	for i in range(12):
		var g=MeshInstance3D.new()
		g.mesh=mesh
		g.material_override=mats.cream
		g.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		add_child(g)
		gulls.append(g)

func _process(dt):
	t+=dt
	if cloud_node:cloud_node.position.x=sin(t*.014)*6
	for i in range(gulls.size()):
		var a=t*.12+float(i)*.6
		var center=Vector3(-105,44,5) if i<6 else Vector3(110,45,-30)
		gulls[i].position=center+Vector3(cos(a)*28,sin(a*2+i)*2,sin(a)*28)
		gulls[i].rotation.y=-a
		gulls[i].rotation.z=sin(t*3+i)*.15
	for group in waiting:
		for f in group:
			if f.node.visible:f.node.rotation.z=sin(t*1.4+f.seed)*.018

func use_light_graphics():
	# An automatic fallback for software renderers and small mobile GPUs.
	# Keep the villages and gameplay intact while reducing shadow and cloud work.
	if sunlight:sunlight.shadow_enabled=false
	if cloud_node:cloud_node.multimesh.visible_instance_count=180
	for n in static_instances:n.lod_bias=.5
