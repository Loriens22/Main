extends Node3D
## Original Blender meshes form the town; instancing keeps the railway and clouds economical.

const TRAM = preload("res://assets/tram.glb")
const ISLAND = preload("res://assets/island.glb")
const TREE = preload("res://assets/tree.glb")
const CYPRESS = preload("res://assets/cypress.glb")
const LIGHTHOUSE = preload("res://assets/lighthouse.glb")
const FOLK = preload("res://assets/townsfolk.glb")
const HOUSES = [preload("res://assets/house_0.glb"), preload("res://assets/house_1.glb"), preload("res://assets/house_2.glb"), preload("res://assets/house_3.glb")]
const TOWNHOUSES = [preload("res://assets/townhouse_0.glb"),preload("res://assets/townhouse_1.glb"),preload("res://assets/townhouse_2.glb")]
const MUSHROOMS = [preload("res://assets/mushroom_0.glb"),preload("res://assets/mushroom_1.glb"),preload("res://assets/mushroom_2.glb")]
const PUMPKIN_HOUSES = [preload("res://assets/pumpkin_house_0.glb"),preload("res://assets/pumpkin_house_1.glb")]
const RESIDENTS = [preload("res://assets/folk_0.glb"),preload("res://assets/folk_1.glb"),preload("res://assets/folk_2.glb"),preload("res://assets/folk_3.glb")]
const FOREST = preload("res://assets/forest_mushrooms.glb")
const PUMPKINS = preload("res://assets/pumpkins.glb")
const SCARECROW = preload("res://assets/scarecrow.glb")
const OBSERVATORY = preload("res://assets/observatory.glb")
const ORRERY = preload("res://assets/orrery.glb")
const STALL = preload("res://assets/market_stall.glb")
const PROPS = preload("res://assets/street_props.glb")
const BARREL = preload("res://assets/barrel.glb")
const BENCH = preload("res://assets/bench.glb")
const FOUNTAIN = preload("res://assets/fountain.glb")
const WINDMILL = preload("res://assets/windmill.glb")
const AIRSHIP = preload("res://assets/airship.glb")
const CAT = preload("res://assets/cat.glb")
const BOAT = preload("res://assets/boat.glb")
const PALM = preload("res://assets/palm.glb")

var curve = Curve3D.new()
var length = 0.0
var stations = []
var waiting = []
var cloud_node: MultiMeshInstance3D
var gulls = []
var beacon: Node3D
var shop_tram: Node3D
var crane: Node3D
var workshop = Vector3(-40, 32, 360)
var rng = RandomNumberGenerator.new()
var mats = {}
var t = 0.0
var compact_assets = {}
var pending_boxes = {}
var vertex_material: StandardMaterial3D
var vertex_glow: StandardMaterial3D
var vertex_metal: StandardMaterial3D
var sunlight: DirectionalLight3D
var static_instances = []
var batch_sources = []
var residents = []
var rotating = []
var smoke: MultiMeshInstance3D
var fireflies: MultiMeshInstance3D
var airship: Node3D
var island_roots = []
var station_roots = []
var stream_material: ShaderMaterial

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
	mats.earth = paint(Color("576b40"))
	mats.moss = paint(Color("465538"))
	mats.cobble = paint(Color("a79b85"))
	mats.cobble2 = paint(Color("8e8879"))
	mats.iron = paint(Color("3e4d50"), .45)
	mats.pumpkin = paint(Color("d0833e"))
	mats.plum = paint(Color("55415c"))
	mats.copper = paint(Color("42837d"),.3)
	mats.rose = paint(Color("cb8468"))
	mats.linen = paint(Color("e7d1a3"))
	vertex_material=paint(Color.WHITE)
	vertex_material.vertex_color_use_as_albedo=true
	vertex_material.vertex_color_is_srgb=true
	# Fine, world-scaled surface variation catches light on plaster, bark and cut stone.
	# It stays subtle enough to preserve the hand-painted palette and readable silhouettes.
	var noise=FastNoiseLite.new()
	noise.seed=719
	noise.frequency=.14
	noise.fractal_octaves=3
	var grain=NoiseTexture2D.new()
	grain.width=128
	grain.height=128
	grain.noise=noise
	grain.seamless=true
	var gradient=Gradient.new()
	gradient.colors=PackedColorArray([Color(.78,.77,.73),Color(1,1,1)])
	grain.color_ramp=gradient
	vertex_material.albedo_texture=grain
	vertex_material.uv1_triplanar=true
	vertex_material.uv1_world_triplanar=true
	vertex_material.uv1_scale=Vector3.ONE*.24
	vertex_glow=paint(Color.WHITE)
	vertex_glow.vertex_color_use_as_albedo=true
	vertex_glow.vertex_color_is_srgb=true
	vertex_glow.emission_enabled=true
	vertex_glow.emission=Color("ffbe65")
	vertex_glow.emission_energy_multiplier=.7
	vertex_metal=paint(Color.WHITE,.38)
	vertex_metal.vertex_color_use_as_albedo=true
	vertex_metal.vertex_color_is_srgb=true
	vertex_metal.roughness=.32
	build_atmosphere()
	build_curve()
	build_railway()
	for i in range(stations.size()):
		waiting.append([])
		build_village(i)
	build_distant_islands()
	build_workshop()
	build_gulls()
	build_life()
	flush_boxes()
	flush_scene_instances()

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

func piece(scene: PackedScene, parent: Node3D, p: Vector3, size = 1.0, yaw = 0.0, moving = false) -> Node3D:
	var n = scene.instantiate()
	if scene!=TRAM:
		for child in n.find_children("*","MeshInstance3D",true,false):
			var key=child.mesh.get_instance_id()
			if not compact_assets.has(key):compact_assets[key]=compact_mesh(child.mesh)
			child.mesh=compact_assets[key]
			if not moving and scene!=FOLK and not scene in RESIDENTS:
				batch_sources.append(child)
			else:static_instances.append(child)
	parent.add_child(n)
	n.position = p
	n.scale = Vector3.ONE * size
	n.rotation.y = yaw
	return n

func flush_scene_instances():
	# Repeated models are batched per neighbourhood, preserving culling on a large archipelago.
	var groups={}
	for source in batch_sources:
		var p=source.global_position
		var key="%s:%s:%s"%[source.mesh.get_instance_id(),floori(p.x/120),floori(p.z/120)]
		if not groups.has(key):groups[key]={"mesh":source.mesh,"transforms":[]}
		groups[key].transforms.append(source.global_transform)
	for group in groups.values():
		var n=multi(group.mesh,group.transforms.size(),true)
		for i in range(group.transforms.size()):n.multimesh.set_instance_transform(i,group.transforms[i])
		static_instances.append(n)
	for source in batch_sources:source.queue_free()
	batch_sources.clear()

func compact_mesh(original: Mesh) -> ArrayMesh:
	# Preserve the Blender palette and normals while folding static surfaces into vertex colours.
	# Windows keep an emissive surface. Each source asset is baked only once and reused.
	var result=ArrayMesh.new()
	for kind in [0,1,2]:
		var vertices=PackedVector3Array()
		var normals=PackedVector3Array()
		var colors=PackedColorArray()
		var indices=PackedInt32Array()
		var lods={}
		for edge in [.08,.25,.6,1.2,2.5]:lods[edge]=PackedInt32Array()
		for s in range(original.get_surface_count()):
			var m=original.surface_get_material(s)
			var material_kind=2 if m.emission_enabled else (1 if m.metallic>.15 else 0)
			if material_kind!=kind:continue
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
		result.surface_set_material(result.get_surface_count()-1,[vertex_material,vertex_metal,vertex_glow][kind])
	return result

func flush_boxes():
	for group in pending_boxes.values():
		var mesh=BoxMesh.new()
		mesh.size=Vector3.ONE
		mesh.material=group.material
		var shadow=group.material!=mats.cobble and group.material!=mats.cobble2 and group.material!=mats.glow
		var n=multi(mesh,group.transforms.size(),shadow)
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
  vec3 horizon = vec3(.49, .36, .46);
  vec3 twilight = vec3(.17, .23, .39);
  vec3 night = vec3(.055, .09, .20);
  vec3 c = mix(horizon, twilight, smoothstep(-.08,.23,y));
  c = mix(c, night, smoothstep(.17,.8,y));
  vec3 sun = normalize(vec3(-.55,.17,-.8));
  float d = dot(EYEDIR,sun);
  c += vec3(.7,.4,.16)*pow(max(d,0.),32.)*.33;
  c += vec3(1.,.73,.41)*smoothstep(.9985,.9992,d)*.9;
  vec3 moon=normalize(vec3(.68,.42,-.5));
  float md=dot(EYEDIR,moon);
  c += vec3(.21,.24,.29)*pow(max(md,0.),96.);
  c=mix(c,vec3(.86,.85,.71),smoothstep(.9992,.9995,md));
  COLOR = c;
}"""
	var sm = ShaderMaterial.new()
	sm.shader = shader
	sky.sky_material = sm
	sky.radiance_size = Sky.RADIANCE_SIZE_128
	e.sky = sky
	e.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	e.ambient_light_color = Color("9ca9c4")
	e.ambient_light_energy = 0.34
	e.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	e.fog_enabled = true
	e.fog_light_color = Color("7e819e")
	e.fog_density = 0.00072
	e.fog_sky_affect = 0.12
	env.environment = e
	add_child(env)
	var sun = DirectionalLight3D.new()
	sunlight=sun
	sun.rotation_degrees = Vector3(-21, -37, 0)
	sun.light_color = Color("ffd4a4")
	sun.light_energy = .75
	sun.shadow_enabled = true
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_2_SPLITS
	sun.directional_shadow_max_distance = 85
	add_child(sun)
	var fill = DirectionalLight3D.new()
	fill.rotation_degrees = Vector3(-40, 140, 0)
	fill.light_color = Color("aaaee3")
	fill.light_energy = .10
	add_child(fill)
	var ocean = MeshInstance3D.new()
	var plane = PlaneMesh.new()
	plane.size = Vector2(4000,4000)
	plane.subdivide_width = 80
	plane.subdivide_depth = 80
	ocean.mesh = plane
	ocean.position.y = -78
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
	cloud_mesh.radial_segments = 16
	cloud_mesh.rings = 8
	cloud_mesh.radius = 1
	cloud_mesh.height = 2
	cloud_mesh.material = paint(Color("b4b6ca"))
	cloud_mesh.material.vertex_color_use_as_albedo=true
	cloud_node = multi(cloud_mesh, 420, false, true)
	for i in range(140):
		var center = Vector3(rng.randf_range(-900,900), rng.randf_range(-30,-13), rng.randf_range(-920,850))
		for j in range(3):
			var pos = center + Vector3(j*23-23, rng.randf_range(-3,4), rng.randf_range(-9,9))
			var sc = Vector3(rng.randf_range(30,62),rng.randf_range(8,18),rng.randf_range(24,48))
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
	# Long level approaches give every platform a straight, accessible arrival.
	var pts = [Vector3(-225,36,180),Vector3(-188,36,180),Vector3(-140,40,196),Vector3(-85,49,207),Vector3(-22,53,187),Vector3(40,34,210),Vector3(90,34,210),Vector3(135,34,210),Vector3(192,43,155),Vector3(236,57,65),Vector3(255,52,-25),Vector3(255,52,-75),Vector3(255,52,-120),Vector3(218,57,-191),Vector3(153,46,-240),Vector3(110,38,-260),Vector3(60,38,-260),Vector3(14,38,-260),Vector3(-85,46,-263),Vector3(-192,70,-221),Vector3(-250,64,-140),Vector3(-250,64,-90),Vector3(-250,64,-45),Vector3(-283,55,26),Vector3(-290,43,105),Vector3(-268,36,180)]
	curve.bake_interval = .4
	for i in range(pts.size()+1):
		var j = i%pts.size()
		var tangent = (pts[(j+1)%pts.size()]-pts[posmod(j-1,pts.size())])/6.0
		curve.add_point(pts[j],-tangent,tangent)
	length = curve.get_baked_length()
	stations = [
		{"name":"Saltlight Terminus","theme":"salt","index":0,"tag":"The lighthouse quarter","passengers":12,"resident":"Ada, the postmistress","story":"Ada: The evening letters are aboard. Five islands, five little worlds. Take your time.","description":"Narrow limestone streets, balcony gardens and the beacon that brings everyone home."},
		{"name":"Mango Tide","theme":"mango","index":6,"tag":"The hanging harbour","passengers":13,"resident":"Luca, the fruit seller","story":"Luca: A basket of mangoes for Fernbell. Mind the bridge — they bruise almost as easily as my knees.","description":"A lively market, terracotta terraces and fishing skiffs suspended above the cloud tide."},
		{"name":"Fernbell","theme":"fern","index":11,"tag":"The mushroom village","passengers":11,"resident":"Mira, the spore keeper","story":"Mira: The lamps are living mushrooms. We leave a few glowing for travellers who lose their way.","description":"Giant freckled mushroom homes, luminous gills, fern gardens and fireflies in the old sporewood."},
		{"name":"Lantern Hollow","theme":"harvest","index":16,"tag":"The harvest festival","passengers":14,"resident":"Pip, the lantern maker","story":"Pip: Every lantern is a wish. Mine is simple: everyone gets home before the pumpkin soup goes cold.","description":"Ribbed pumpkin cottages, cheerful jack lanterns, copper leaves and a festival that never quite ends."},
		{"name":"Tideglass Observatory","theme":"astral","index":21,"tag":"The garden of small moons","passengers":10,"resident":"Iris, the astronomer","story":"Iris: Tonight the moon follows the tram. I measured it twice. Even the stars like a gentle ride.","description":"An immense copper telescope, slow windmills, celestial gardens and a waterfall dissolving into clouds."}
	]
	for station in stations:
		station.point=pts[station.index]
		station.distance=curve.get_closest_offset(station.point)

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
	var support_count=int(length/36)
	var supports=multi(beam_mesh,support_count*5,true)
	for i in range(support_count):
		var f=frame(float(i)*36)
		var p=f.origin
		var right=f.basis.x
		var bottom=p.y-24.0-float(i%3)*3
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
		var anchor=piece(ISLAND,self,Vector3(p.x,bottom,p.z),.24)
		anchor.scale=Vector3(.28,.34,.22)
		# Deep longitudinal trusses give the railway believable structural weight.
		var next=frame(min(length,float(i+1)*36))
		for side in [-1,1]:
			var a=p+right*side*1.28-Vector3(0,.8,0)
			var b=next.origin+next.basis.x*side*1.28-Vector3(0,.8,0)
			beam(self,a-Vector3(0,4.5,0),b-Vector3(0,4.5,0),.23,mats.iron)
			for j in range(4):
				var start=a.lerp(b,float(j)/4)
				var end=a.lerp(b,float(j+1)/4)
				beam(self,start,end-Vector3(0,4.5,0),.12,mats.iron)
				beam(self,start-Vector3(0,4.5,0),end,.12,mats.iron)
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
	# A narrow maintenance walk, rail fasteners, low guardrails and distance lanterns.
	for i in range(int(length/3.0)):
		var f=frame(float(i)*3)
		for side in [-1,1]:
			add_block(self,f*Transform3D(Basis.IDENTITY.scaled(Vector3(.48,.12,2.9)),Vector3(side*1.2,-.02,0)),mats.oak)
			add_block(self,f*Transform3D(Basis.IDENTITY.scaled(Vector3(.13,.035,.22)),Vector3(side*.7,.07,0)),mats.iron)
	for i in range(int(length/8)):
		var f=frame(float(i)*8)
		var next=frame(float(i+1)*8)
		for side in [-1,1]:
			var a=f*Vector3(side*1.65,.2,0)
			var b=next*Vector3(side*1.65,1.0,0)
			beam(self,a,a+Vector3(0,.8,0),.055,mats.iron)
			beam(self,a+Vector3(0,.8,0),b,.045,mats.iron)
		if i%8==0:
			var p=f*Vector3(-1.9,.15,0)
			box(self,p+Vector3(0,.4,0),Vector3(.085,.8,.085),mats.iron)
			box(self,p+Vector3(0,.85,0),Vector3(.16,.20,.16),mats.glow)
	# Stone arches announce the ascent into the ancient sporewood.
	var start=stations[1].distance+80
	for i in range(4):
		var a=frame(start+i*27)
		var b=frame(start+(i+1)*27)
		for side in [-1,1]:
			var last=a.origin+a.basis.x*side*2.15-Vector3(0,8,0)
			for j in range(1,17):
				var f=float(j)/16
				var p=a.origin.lerp(b.origin,f)+a.basis.x*side*2.15-Vector3(0,8-sin(f*PI)*6.3,0)
				beam(self,last,p,.75,mats.stone)
				last=p

func build_village(idx: int):
	var station=stations[idx]
	var f=frame(station.distance)
	var root=Node3D.new()
	add_child(root)
	root.transform=Transform3D(f.basis,f.origin+f.basis.x*26-Vector3(0,2,0))
	root.name=station.name.replace(" ","")
	island_roots.append(root)
	var island=piece(ISLAND,root,Vector3.ZERO,1)
	island.scale=Vector3(2.42,1.65,2.20)
	island.rotation.y=float(idx)*.51
	# Broken cliff shoulders and geological shelves interrupt the simple cone silhouette.
	for i in range(13):
		var a=float(i)*TAU/13
		var crag=piece(ISLAND,root,Vector3(cos(a)*40,-3-rng.randf()*3,sin(a)*36),1)
		crag.scale=Vector3(rng.randf_range(.20,.38),rng.randf_range(.28,.65),rng.randf_range(.18,.28))
		crag.rotation.y=a
	lane(root,[Vector3(-19,0,0),Vector3(-12,0,0),Vector3(-4,0,4),Vector3(6,0,4),Vector3(18,0,10),Vector3(28,0,8)],3.8)
	lane(root,[Vector3(-6,0,29),Vector3(-8,0,17),Vector3(-3,0,4),Vector3(-4,0,-9),Vector3(0,0,-25)],3.0)
	match station.theme:
		"salt","mango":build_seaside(root,idx)
		"fern":build_fernbell(root)
		"harvest":build_harvest(root)
		"astral":build_tideglass(root)
	build_undergrowth(root,idx)
	# Clifftop paths have a practical stone edge, lamps and places to sit.
	for i in range(14):
		var a=-1.1+float(i)*.155
		var p=Vector3(cos(a)*33,0,sin(a)*29)
		box(root,p+Vector3(0,.25,0),Vector3(1.05,.50,.80),mats.stone)
		if i%4==0:lamp(root,p+Vector3(0,.5,0))
	for p in [Vector3(-10,0,5),Vector3(7,0,2),Vector3(-5,0,-19)]:
		piece(PROPS,root,p,.9,rng.randf()*TAU)
	for p in [Vector3(-11,0,9),Vector3(5,0,-4)]:piece(BENCH,root,p,1.0,PI*.5)
	for i in range(5):
		var p=Vector3(-7+i*4,0,4+sin(float(i))*5)
		var folk=piece(RESIDENTS[resident_kind(idx)],root,p,1.0,rng.randf()*TAU,true)
		residents.append({"node":folk,"home":p,"phase":rng.randf()*TAU,"radius":1.2+i*.3})
	piece(CAT,root,Vector3(-11,0,8),1.0,.4,true)
	build_station(idx)

func resident_kind(idx: int) -> int:
	return 0 if idx<2 else idx-1

func build_undergrowth(root: Node3D, idx: int):
	# Uneven meadow edges, stones and flowering groundcover soften the architectural clearings.
	var st=SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	for i in range(5):
		var a=float(i)*TAU/5
		for v in [Vector3(-cos(a)*.10,0,-sin(a)*.10),Vector3(cos(a)*.10,0,sin(a)*.10),Vector3(cos(a)*.16,.45+float(i%2)*.14,sin(a)*.16)]:st.add_vertex(v)
	st.generate_normals()
	var mesh=st.commit()
	mesh.surface_set_material(0,mats.moss if idx==2 else mats.earth)
	var grass=multi(mesh,540,false)
	for i in range(540):
		var patch=float(i/30)*2.4
		var radius=24+float((i/30)%4)*4
		var center=Vector3(cos(patch)*radius,0,sin(patch)*radius)
		var p=center+Vector3(rng.randf_range(-3.5,3.5),.06,rng.randf_range(-3.5,3.5))
		var basis=Basis(Vector3.UP,rng.randf()*TAU).scaled(Vector3.ONE*rng.randf_range(.65,1.6))
		grass.multimesh.set_instance_transform(i,root.global_transform*Transform3D(basis,p))
	for i in range(24):
		var a=float(i)*2.4
		var p=Vector3(cos(a)*(26+(i%4)*4),-.07,sin(a)*(26+(i%3)*3))
		var rock=piece(ISLAND,root,p,.015+(i%3)*.004,a)
		rock.rotation.z=.4
		if i%6==0:piece(PROPS,root,p+Vector3(.8,.05,0),.8,a)

func add_block(parent: Node3D, transform: Transform3D, mat: Material):
	var key=mat.get_instance_id()
	if not pending_boxes.has(key):pending_boxes[key]={"material":mat,"transforms":[]}
	pending_boxes[key].transforms.append(parent.global_transform*transform)

func beam(parent: Node3D, a: Vector3, b: Vector3, width: float, mat: Material):
	var v=b-a
	var basis=Basis.looking_at(v.normalized(),Vector3.RIGHT if abs(v.normalized().y)>.99 else Vector3.UP)
	add_block(parent,Transform3D(basis.scaled(Vector3(width,width,v.length())),(a+b)*.5),mat)

func lane(parent: Node3D, points: Array, width: float):
	# A winding lane is paved stone-by-stone, with irregular joints rather than a flat grey stripe.
	var path=Curve3D.new()
	for i in range(points.size()):
		var before=points[max(0,i-1)]
		var after=points[min(points.size()-1,i+1)]
		var tangent=(after-before)/6.0
		path.add_point(points[i],-tangent,tangent)
	path.bake_interval=.4
	var total=path.get_baked_length()
	for row in range(int(total/.58)):
		var d=float(row)*.58
		var p=path.sample_baked(d,true)
		var direction=(path.sample_baked(min(total,d+.2),true)-path.sample_baked(max(0,d-.2),true)).normalized()
		var side=direction.cross(Vector3.UP).normalized()
		for col in range(int(width/.53)):
			var pos=p+side*(float(col)*.53-width*.5+.25+(row%2)*.1)+Vector3(0,.045+rng.randf()*.014,0)
			var size=Vector3(.48+rng.randf()*.035,.075,.52)
			var basis=Basis.looking_at(direction,Vector3.UP).rotated(Vector3.UP,rng.randf_range(-.035,.035)).scaled(size)
			add_block(parent,Transform3D(basis,pos),mats.cobble if (row+col)%4 else mats.cobble2)

func terrace(parent: Node3D, p: Vector3, radius: float, height: float):
	# Natural ledges share the island's fractured geology, with stonework only at the cut face.
	var ledge=piece(ISLAND,parent,p+Vector3(0,height,0),1)
	ledge.scale=Vector3(radius/21,.25,radius/21)
	ledge.rotation.y=.23
	for i in range(13):
		var a=PI*.67+float(i)*PI*.66/12
		for j in range(int(height/.45)):
			var pos=p+Vector3(cos(a)*(radius*.90),.22+j*.43,sin(a)*(radius*.90))
			var basis=Basis(Vector3.UP,-a).scaled(Vector3(.78,.32,.38))
			add_block(parent,Transform3D(basis,pos),mats.cobble if i%3 else mats.cobble2)
	for i in range(int(height/.22)+1):box(parent,p+Vector3(-radius-1-i*.28,height-i*.22,0),Vector3(.34,.23,2.3),mats.stone)

func house_facing(scene: PackedScene, root: Node3D, p: Vector3, size: float, toward=Vector3.ZERO):
	var dir=toward-p
	piece(scene,root,p,size,atan2(-dir.x,-dir.z))
	piece(PROPS,root,p+dir.normalized()*3.4,size*.75,rng.randf()*TAU)

func build_seaside(root: Node3D, idx: int):
	# A terraced town grows out of a market square, rather than repeating a building grid.
	terrace(root,Vector3(19,0,-12),10,2.6)
	var layout=[Vector3(-15,0,-12),Vector3(-15,0,15),Vector3(-4,0,-24),Vector3(8,0,-17),Vector3(18,2.6,-14),Vector3(25,2.6,-5),Vector3(16,0,20),Vector3(3,0,22),Vector3(-17,0,29)]
	for i in range(layout.size()):
		var scene=TOWNHOUSES[(i+idx)%3] if i in [0,2,4,5] else HOUSES[(i+idx)%4]
		house_facing(scene,root,layout[i],rng.randf_range(.95,1.18),Vector3(-3,layout[i].y,4))
	piece(FOUNTAIN,root,Vector3(-2,0,4),1)
	for p in [Vector3(-13,0,-23),Vector3(7,0,30),Vector3(23,0,22),Vector3(-23,0,-8),Vector3(29,0,-15),Vector3(-25,0,22)]:piece(TREE,root,p,rng.randf_range(1.4,2.1),rng.randf()*TAU)
	for p in [Vector3(8,0,-5),Vector3(28,0,14),Vector3(-8,0,-17),Vector3(11,0,17)]:piece(CYPRESS,root,p,1.5)
	if idx==0:piece(LIGHTHOUSE,root,Vector3(28,0,-27),1.55)
	else:
		var mill=piece(WINDMILL,root,Vector3(28,0,-27),1.25,PI*.25,true)
		rotating.append({"node":mill.find_child("Blades",true,false),"axis":Vector3.FORWARD,"speed":.17})
		for p in [Vector3(-23,0,-5),Vector3(11,0,30),Vector3(30,0,8),Vector3(-8,0,-30)]:piece(PALM,root,p,1.3,rng.randf()*TAU)
	for p in [Vector3(-10,0,-3),Vector3(5,0,9),Vector3(-3,0,17),Vector3(14,2.6,-11)]:lamp(root,p)
	for p in [Vector3(-4,0,-7),Vector3(8,0,7),Vector3(0,0,13)]:piece(STALL,root,p,1,PI*.5 if p.z<0 else 0)
	label(root,"POSTE" if idx==0 else "MARCHÉ",Vector3(-3,3.25,-24),30)
	# Laundry lines, shop bunting and café furniture explain who uses these streets.
	bunting(root,Vector3(-12,4.8,15),Vector3(3,5.2,22),false)
	bunting(root,Vector3(-15,4,-12),Vector3(8,4.8,-17),false)
	for i in range(4):
		var p=Vector3(7+i*1.9,0,13)
		box(root,p+Vector3(0,.82,0),Vector3(.9,.10,.9),mats.oak)
		for side in [-1,1]:piece(BENCH,root,p+Vector3(0,0,side*.8),.42,0 if side==1 else PI)
	build_dock(root,idx)
	waterfall(root,Vector3(34,-1,-4),22,1.3)

func build_fernbell(root: Node3D):
	terrace(root,Vector3(15,0,-15),10,3.4)
	var layout=[Vector3(-14,0,-15),Vector3(-14,0,14),Vector3(0,0,-23),Vector3(15,3.4,-15),Vector3(25,0,7),Vector3(6,0,20)]
	for i in range(layout.size()):house_facing(MUSHROOMS[i%3],root,layout[i],1.4 if i==3 else rng.randf_range(.95,1.2),Vector3(-2,0,4))
	piece(TREE,root,Vector3(2,0,4),2.9)
	for i in range(21):
		var a=float(i)*2.4
		var p=Vector3(cos(a)*(24+(i%4)*4),0,sin(a)*(25+(i%3)*4))
		piece(TREE,root,p,1.3+(i%4)*.25,a)
		piece(FOREST,root,p+Vector3(2,0,1),1.2+(i%3)*.4,a)
	for i in range(12):piece(FOREST,root,Vector3(-12+(i%4)*7,0,-10+(i/4)*11),.6+(i%3)*.35,float(i))
	bunting(root,Vector3(-14,5,14),Vector3(6,5.8,20),true)
	bunting(root,Vector3(-14,5,-15),Vector3(2,9,4),true)
	label(root,"THE BELLCAP INN",Vector3(10,7.2,-5),32)
	for p in [Vector3(-9,0,-6),Vector3(-8,0,11),Vector3(8,0,4)]:lamp(root,p)
	# Oversized roots and fallen trunks weave around the paths.
	for i in range(7):
		var a=float(i)*TAU/7
		beam(root,Vector3(2,1,4),Vector3(2+cos(a)*5.5,.2,4+sin(a)*5.5),.28,mats.oak)
	waterfall(root,Vector3(33,-1,-22),30,.7)

func build_harvest(root: Node3D):
	terrace(root,Vector3(18,0,-16),11,2.4)
	var layout=[Vector3(-14,0,-16),Vector3(-15,0,14),Vector3(0,0,-26),Vector3(17,2.4,-16),Vector3(25,0,8),Vector3(8,0,22)]
	for i in range(layout.size()):house_facing(PUMPKIN_HOUSES[i%2],root,layout[i],1.25 if i==3 else 1.05,Vector3(-3,0,4))
	for i in range(18):
		var a=float(i)*2.4
		piece(PUMPKINS,root,Vector3(cos(a)*(8+(i%5)*5),0,sin(a)*(8+(i%4)*6)),.8+(i%3)*.3,a)
	for p in [Vector3(-8,0,-8),Vector3(13,0,8),Vector3(-8,0,21)]:piece(SCARECROW,root,p,1.0)
	for p in [Vector3(-5,0,-6),Vector3(8,0,4),Vector3(1,0,13)]:
		piece(STALL,root,p,1.05,PI*.5)
		piece(BARREL,root,p+Vector3(2,0,0),1.0)
	# Copper-leaved trees and fallen leaves keep the harvest palette grounded.
	for i in range(10):
		var a=float(i)*2.4
		var tree=piece(TREE,root,Vector3(cos(a)*30,0,sin(a)*28),1.7,a,true)
		for m in tree.find_children("*","MeshInstance3D",true,false):
			m.material_override=autumn_material()
	for i in range(160):
		var p=Vector3(rng.randf_range(-25,27),.09,rng.randf_range(-25,27))
		add_block(root,Transform3D(Basis(Vector3.UP,rng.randf()*TAU).scaled(Vector3(.14,.015,.27)),p),mats.rose if i%2 else mats.pumpkin)
	bunting(root,Vector3(-14,5.6,-16),Vector3(17,7.5,-16),true)
	bunting(root,Vector3(-15,5.4,14),Vector3(8,5.4,22),true)
	label(root,"THE LONGEST EVENING\nHARVEST FAIR",Vector3(-2,3.3,4),28)
	for p in [Vector3(-7,0,6),Vector3(6,0,-4),Vector3(-7,0,-13)]:lamp(root,p)

func autumn_material() -> ShaderMaterial:
	if mats.has("autumn"):return mats.autumn
	var shader=Shader.new()
	shader.code="""shader_type spatial;
void fragment(){
 vec3 c=COLOR.rgb;
 float leaves=step(c.r*1.16,c.g);
 ALBEDO=mix(c,mix(vec3(.42,.16,.055),vec3(.70,.36,.10),c.r*1.7),leaves);
 ROUGHNESS=.85;
}"""
	var mat=ShaderMaterial.new()
	mat.shader=shader
	mats.autumn=mat
	return mat

func build_tideglass(root: Node3D):
	terrace(root,Vector3(13,0,-15),14,4.1)
	piece(OBSERVATORY,root,Vector3(13,4.1,-15),1.35,2.3,true)
	for i in range(3):
		var p=Vector3(-14+i*15,0,20)
		house_facing(TOWNHOUSES[i],root,p,1.05,Vector3(-3,0,4))
		piece(CYPRESS,root,p+Vector3(-5,0,2),1.6)
	piece(ORRERY,root,Vector3(-1,0,4),1.7,0,true)
	var mill=piece(WINDMILL,root,Vector3(29,0,18),1.4,-PI*.5,true)
	rotating.append({"node":mill.find_child("Blades",true,false),"axis":Vector3.FORWARD,"speed":.15})
	for p in [Vector3(-18,0,-20),Vector3(-12,0,-7),Vector3(28,0,-28),Vector3(10,0,31)]:piece(CYPRESS,root,p,2.0)
	for p in [Vector3(-5,0,-5),Vector3(9,0,8),Vector3(-12,0,10)]:lamp(root,p)
	label(root,"TIDEGLASS\nOBSERVATORY",Vector3(12,9.5,-7),34)
	# A monumental armillary sphere frames the sky above the cliff walk.
	for i in range(3):
		var n=MeshInstance3D.new()
		var torus=TorusMesh.new()
		torus.inner_radius=6.0+i*.45
		torus.outer_radius=6.07+i*.45
		torus.rings=64
		torus.ring_segments=6
		n.mesh=torus
		n.material_override=mats.brass
		n.position=Vector3(22,10,6)
		n.rotation=Vector3(.6+i*.52,.3,i*.3)
		root.add_child(n)
		rotating.append({"node":n,"axis":Vector3.UP,"speed":.012*(i+1)})
	waterfall(root,Vector3(35,-1,-4),38,2.4)

func bunting(root: Node3D, a: Vector3, b: Vector3, lanterns: bool):
	var last=a
	for i in range(1,19):
		var fraction=float(i)/18
		var p=a.lerp(b,fraction)-Vector3(0,sin(fraction*PI)*1.4,0)
		beam(root,last,p,.025,mats.iron)
		last=p
		if i%2==0:
			if lanterns:
				box(root,p-Vector3(0,.23,0),Vector3(.22,.35,.22),mats.glow)
				box(root,p-Vector3(0,.43,0),Vector3(.28,.045,.28),mats.green)
			else:
				var st=SurfaceTool.new()
				st.begin(Mesh.PRIMITIVE_TRIANGLES)
				for v in [p+Vector3(-.22,0,0),p+Vector3(.22,0,0),p-Vector3(0,.55,0)]:st.add_vertex(v)
				st.generate_normals()
				var n=MeshInstance3D.new()
				n.mesh=st.commit()
				n.material_override=mats.rose if i%4 else mats.linen
				root.add_child(n)

func build_dock(root: Node3D, idx: int):
	var p=Vector3(9,0,32)
	lane(root,[Vector3(7,0,22),p],2.1)
	for i in range(23):box(root,p+Vector3(0,-.12,i*.5),Vector3(4.3,.18,.44),mats.oak)
	for i in range(6):
		for side in [-1,1]:
			var q=p+Vector3(side*2,-1.6,i*2.1)
			box(root,q,Vector3(.25,4.5,.25),mats.oak)
			if i<5:beam(root,q+Vector3(0,2.0,0),q+Vector3(0,2.0,2.1),.08,mats.cream)
	for p2 in [Vector3(10,0,30),Vector3(7,0,33),Vector3(11,0,37)]:piece(BARREL,root,p2,1.0)
	piece(BOAT,root,Vector3(14,-1.2,39),.8,.3,true)
	label(root,"AIR HARBOUR" if idx==1 else "THE OLD LANDING",Vector3(9,2,31),25)

func waterfall(root: Node3D, p: Vector3, drop: float, width: float):
	if not stream_material:
		var shader=Shader.new()
		shader.code="""shader_type spatial;
render_mode cull_disabled;
void fragment(){
 float flow=sin(UV.x*43.+sin(UV.y*8.+TIME)*3.+TIME*2.)*.5+.5;
 float foam=smoothstep(.82,1.,sin(UV.y*80.-TIME*7.+UV.x*15.));
 ALBEDO=mix(vec3(.26,.56,.62),vec3(.70,.80,.80),flow*.4+foam*.45);
 ROUGHNESS=.3; EMISSION=ALBEDO*.12;
}"""
		stream_material=ShaderMaterial.new()
		stream_material.shader=shader
	var n=MeshInstance3D.new()
	var plane=PlaneMesh.new()
	plane.size=Vector2(width,drop)
	plane.orientation=PlaneMesh.FACE_Z
	n.mesh=plane
	n.position=p-Vector3(0,drop*.5,0)
	n.material_override=stream_material
	root.add_child(n)
	# Stone spillway defines where the stream leaves the island.
	for side in [-1,1]:box(root,p+Vector3(side*(width*.5+.2),-.3,0),Vector3(.4,.6,1.4),mats.stone)

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
	add_child(root)
	root.transform=frame(stations[idx].distance)
	station_roots.append(root)
	var accent=mats.green
	if idx==2:accent=mats.moss
	if idx==3:accent=mats.plum
	if idx==4:accent=mats.copper
	box(root,Vector3(4.2,.55,0),Vector3(5.7,.8,26),mats.stone)
	box(root,Vector3(1.45,.98,0),Vector3(.15,.06,26),mats.cream)
	# Worn platform slabs, a tactile safety strip, benches and a proper station clock.
	for i in range(43):
		for col in range(8):box(root,Vector3(1.7+col*.64,1.0,-12.8+i*.6),Vector3(.60,.035,.56),mats.cobble if (i+col)%4 else mats.cobble2)
	for z in [-11,-5,5,11]:
		box(root,Vector3(6.7,2.65,z),Vector3(.18,3.4,.18),accent)
		beam(root,Vector3(6.7,3.2,z),Vector3(5.7,4.2,z),.12,mats.brass)
	var roof_mat=mats.copper if idx==4 else (mats.moss if idx==2 else (mats.plum if idx==3 else mats.tile))
	box(root,Vector3(6.7,4.45,0),Vector3(2.5,.20,26.8),roof_mat)
	box(root,Vector3(7.05,3.3,0),Vector3(.16,1.18,8.1),accent)
	var sign=label(root,stations[idx].name.to_upper(),Vector3(6.94,3.36,0),32)
	sign.rotation.y=-PI*.5
	var tag=label(root,stations[idx].tag.to_upper(),Vector3(6.93,2.83,0),16)
	tag.rotation.y=-PI*.5
	for z in [-10,10]:
		lamp(root,Vector3(2.8,.98,z))
		piece(BENCH,root,Vector3(5.9,1.02,z-1),1.0,PI*.5)
		piece(PROPS,root,Vector3(5.8,1.0,z+1),.8)
	box(root,Vector3(7.05,1.8,-6.2),Vector3(.16,1.3,1.3),mats.oak)
	box(root,Vector3(6.93,1.8,-6.2),Vector3(.06,1.05,1.05),mats.linen)
	var timetable=label(root,"COASTAL LINE\nDEPARTURES\nEVERY EVENING",Vector3(6.88,1.8,-6.2),14,Color("25483e"))
	timetable.rotation.y=-PI*.5
	clock_face(root,Vector3(6.5,4.0,7.5))
	for i in range(6):
		var scene=RESIDENTS[resident_kind(idx)] if i%2==0 else RESIDENTS[(i+idx)%4]
		var f=piece(scene,root,Vector3(3.3,.99,-4.0+i*1.5),1.0,PI*.5,true)
		waiting[idx].append({"node":f,"home":f.position,"seed":rng.randf()*TAU})
	piece(CAT,root,Vector3(5.2,1.02,9),1.0,-PI*.3,true)
	# Platform to village staircase: a clear human connection between track and town.
	for i in range(14):box(root,Vector3(7.2+i*.33,.90-i*.21,0),Vector3(.38,.22,3.0),mats.stone)
	for side in [-1,1]:beam(root,Vector3(7.0,1.85,side*1.6),Vector3(12,-1.1,side*1.6),.07,mats.iron)
	if idx==2:
		for z in [-11,11]:piece(FOREST,root,Vector3(7.7,.8,z),1.2)
	if idx==3:
		for z in [-11,11,-6]:piece(PUMPKINS,root,Vector3(6.0,1.05,z),1.0)
	if idx==4:piece(ORRERY,root,Vector3(8,-2,11),1.0)

func clock_face(root: Node3D, p: Vector3):
	var n=MeshInstance3D.new()
	var disk=CylinderMesh.new()
	disk.top_radius=.44
	disk.bottom_radius=.44
	disk.height=.08
	disk.radial_segments=24
	disk.material=mats.linen
	n.mesh=disk
	n.position=p
	n.rotation.z=PI*.5
	root.add_child(n)
	beam(root,p+Vector3(-.055,0,0),p+Vector3(-.055,.24,0),.027,mats.green)
	beam(root,p+Vector3(-.06,0,0),p+Vector3(-.06,-.10,.17),.033,mats.green)
	for i in range(12):
		var a=float(i)*TAU/12
		box(root,p+Vector3(-.05,cos(a)*.35,sin(a)*.35),Vector3(.018,.035,.035),mats.brass)

func build_distant_islands():
	var positions = [Vector3(500,25,-350),Vector3(-580,48,-390),Vector3(450,72,350),Vector3(-540,19,430),Vector3(50,25,-610),Vector3(720,43,60),Vector3(-730,75,-80)]
	for i in range(positions.size()):
		var p = positions[i]
		var island=piece(ISLAND,self,p,1.2+float(i%3)*.4)
		island.rotation.y=float(i)
		piece(HOUSES[i%4],self,p+Vector3(4,0,0),1.3)
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
		if i in [1,3,4]:
			var crag=piece(ISLAND,self,p+Vector3(9,18,-12),.8)
			crag.rotation.z=PI
			crag.scale=Vector3(1.1,1.9,1.1)

func build_life():
	# Each neighbourhood has ambient life independent of the tram's simulation.
	var puff=SphereMesh.new()
	puff.radius=.28
	puff.height=.56
	puff.radial_segments=8
	puff.rings=4
	var smoke_mat=paint(Color("ada9b6"))
	smoke_mat.transparency=BaseMaterial3D.TRANSPARENCY_ALPHA
	smoke_mat.albedo_color.a=.32
	smoke_mat.shading_mode=BaseMaterial3D.SHADING_MODE_UNSHADED
	smoke_mat.vertex_color_use_as_albedo=true
	puff.material=smoke_mat
	smoke=multi(puff,48,false,true)
	var fire=SphereMesh.new()
	fire.radius=.075
	fire.height=.15
	fire.radial_segments=6
	fire.rings=3
	var firemat=paint(Color("f1d481"),0,true)
	firemat.shading_mode=BaseMaterial3D.SHADING_MODE_UNSHADED
	fire.material=firemat
	fireflies=multi(fire,70)
	airship=piece(AIRSHIP,self,Vector3(10,81,100),1.1,0,true)
	var watermill=piece(WINDMILL,self,workshop+Vector3(15,0,-12),.9,PI*.25,true)
	rotating.append({"node":watermill.find_child("Blades",true,false),"axis":Vector3.FORWARD,"speed":.12})

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
	# Oliver's working corner: parts bins, a pegboard, a clock and tea by the door.
	piece(PROPS,self,workshop+Vector3(-7,0,4),.9)
	for p in [Vector3(-7,0,-5),Vector3(5,0,-6),Vector3(7,0,4)]:piece(BARREL,self,workshop+p,.8)
	piece(BENCH,self,workshop+Vector3(-8,0,7),1.0,PI*.5)
	box(self,workshop+Vector3(-5.85,2.6,-3),Vector3(.10,1.4,2.8),mats.oak)
	for i in range(9):
		var p=workshop+Vector3(-5.7,2.2+float(i%3)*.4,-4+float(i/3)*.65)
		beam(self,p,p+Vector3(0,.23,.10),.035,mats.brass)
		box(self,p+Vector3(0,.25,.12),Vector3(.08,.07,.20),mats.iron)
	clock_face(self,workshop+Vector3(-5.65,3.5,2.0))
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
		var center=stations[0].point+Vector3(0,22,0) if i<6 else stations[1].point+Vector3(0,24,0)
		gulls[i].position=center+Vector3(cos(a)*28,sin(a*2+i)*2,sin(a)*28)
		gulls[i].rotation.y=-a
		gulls[i].rotation.z=sin(t*3+i)*.15
	for group in waiting:
		for f in group:
			if f.node.visible:f.node.rotation.z=sin(t*1.4+f.seed)*.018
	for r in residents:
		var phase=t*.12+r.phase
		var offset=Vector3(sin(phase)*r.radius,abs(sin(t*3+r.phase))*.025,cos(phase)*r.radius*.6)
		r.node.position=r.home+offset
		r.node.rotation.y=atan2(-cos(phase),sin(phase)*.6)
	for item in rotating:
		if item.node:item.node.rotate_object_local(item.axis,item.speed*dt)
	if airship:
		var a=t*.012
		airship.position=Vector3(20+cos(a)*135,86+sin(t*.18)*1.2,60+sin(a)*120)
		airship.rotation.y=-a
	if smoke:
		for i in range(48):
			var phase=fposmod(t*.32+float(i%8)*.75,6.0)
			var island=island_roots[(i/8)%island_roots.size()]
			var base=Vector3(0,8,-23) if (i/8)%2==0 else Vector3(-14,7,-14)
			var p=island.global_transform*(base+Vector3(phase*.45,phase*1.4,phase*.18))
			smoke.multimesh.set_instance_transform(i,Transform3D(Basis.IDENTITY.scaled(Vector3.ONE*(.4+phase*.2)),p))
			smoke.multimesh.set_instance_color(i,Color(1,1,1,1-phase/6))
	if fireflies:
		for i in range(70):
			var home=island_roots[2] if i<45 else island_roots[3]
			var a=float(i)*2.4+t*.09
			var r=5+float(i%6)*4
			var p=home.global_transform*Vector3(cos(a)*r,1.5+sin(t*.6+i)*.8+float(i%4),sin(a)*r)
			var scale=.35+pow((sin(t*1.3+i)+1)*.5,3)*.7
			fireflies.multimesh.set_instance_transform(i,Transform3D(Basis.IDENTITY.scaled(Vector3.ONE*scale),p))

func use_light_graphics():
	# An automatic fallback for software renderers and small mobile GPUs.
	# Keep the villages and gameplay intact while reducing shadow and cloud work.
	if sunlight:sunlight.shadow_enabled=false
	if cloud_node:cloud_node.multimesh.visible_instance_count=270
	for n in static_instances:n.lod_bias=.5

func use_full_graphics():
	if sunlight:sunlight.shadow_enabled=true
	if cloud_node:cloud_node.multimesh.visible_instance_count=420
	for n in static_instances:n.lod_bias=1.0
