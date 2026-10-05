extends Node3D
## Saltlight's simulation. Distances are metres, velocity is m/s, HUD speed is km/h.
## The web HUD talks to the same simulation through a small JavaScriptBridge.

const WORLD = preload("res://scripts/world.gd")
var world: Node3D
var tram: Node3D
var cam: Camera3D
var clock = 0.0
var distance = 0.0
var speed = 0.0
var accel = 0.0
var previous_accel = 0.0
var comfort = 100.0
var coins = 180
var streak = 1
var passengers = 12
var journeys = 0
var target_station = 1
var current_station = 0
var leg_start = 0.0
var leg_length = 0.0
var mode = "intro"
var paused = false
var power_pressed = false
var brake_pressed = false
var angle_input = 0.0
var view = 0
var wind = 0.0
var lateral = 0.0
var safe_stop = false
var service_pending = false
var service_time = 0.0
var smooth_time = 0.0
var broken = false
var hud_time = 0.0
var door_open = 0.0
var upgrades = {"hearth":false,"companion":false}
var upgrade = ""
var upgrade_time = 0.0
var workshop_return_mode = "docked"
var exit_time = 0.0
var web_callback
var native_label: Label
var door_nodes = []
var roof: Node3D
var shop_roof: Node3D
var ready_sent = false
var web_commands = []
var light_graphics = false
var graphics_start = 0

func _ready():
	world = Node3D.new()
	world.set_script(WORLD)
	add_child(world)
	tram = world.TRAM.instantiate()
	add_child(tram)
	cam = Camera3D.new()
	cam.fov = 51
	cam.near = .2
	cam.far = 1500
	add_child(cam)
	cam.current = true
	get_viewport().scaling_3d_scale=.8
	graphics_start=Time.get_ticks_msec()
	roof = find_part(tram,"Roof")
	shop_roof = find_part(world.shop_tram,"Roof")
	for name in ["Door_Front","Door_Rear"]:
		var node=find_part(tram,name)
		if node:door_nodes.append(node)
	leg_length = world.stations[1].distance
	if OS.has_feature("web"):
		web_callback = JavaScriptBridge.create_callback(_web_command)
		JavaScriptBridge.get_interface("window").saltlightCommand = web_callback
		var saved=JavaScriptBridge.eval("localStorage.getItem('saltlight-save-v1')",true)
		if saved and typeof(saved)==TYPE_STRING:
			var data=JSON.parse_string(saved)
			if data is Dictionary:
				coins=int(data.get("coins",180))
				journeys=int(data.get("journeys",0))
				var u=data.get("upgrades",{})
				upgrades.hearth=bool(u.get("hearth",false))
				upgrades.companion=bool(u.get("companion",false))
	else:
		var ui=CanvasLayer.new()
		add_child(ui)
		native_label=Label.new()
		native_label.position=Vector2(24,24)
		native_label.add_theme_font_size_override("font_size",20)
		ui.add_child(native_label)
	apply_upgrades(tram)
	apply_upgrades(world.shop_tram)
	place_tram(0.0)
	cam.position=tram.position+Vector3(-19,11,18)
	cam.look_at(tram.position+Vector3(2,1.5,0))
	call_deferred("announce_ready")

func announce_ready():
	ready_sent=true
	emit_event("ready", {"engine":"Godot 4.6.3"})
	send_hud()

func find_part(root: Node, wanted: String) -> Node3D:
	if root.name==wanted:return root as Node3D
	for child in root.get_children():
		var found=find_part(child,wanted)
		if found:return found
	return null

func _web_command(args):
	if args.size()==0:return
	var data=JSON.parse_string(str(args[0]))
	if not data is Dictionary:return
	# Queue web actions so a callback never re-enters WebAssembly through a HUD update.
	web_commands.append(data)

func command(action: String, value = true):
	match action:
		"start":
			if mode=="intro":
				mode="drive"
				emit_event("subtitle",{"text":"All aboard. Next stop: Mango Tide.","kind":"welcome"})
		"power":power_pressed=bool(value)
		"brake":brake_pressed=bool(value)
		"look":angle_input=float(value)
		"view":view=(view+1)%3
		"pause":
			paused=bool(value)
			power_pressed=false
			brake_pressed=false
		"doors":
			if mode=="docked" and service_pending:open_doors()
			elif mode=="docked" or (mode=="boarding" and service_time>=5.4):depart()
		"workshop":enter_workshop()
		"return":
			if mode=="workshop":
				mode="exitshop"
				exit_time=0
				emit_event("subtitle",{"text":"All aboard. Next stop: the Coastal Line.","kind":"welcome"})
		"upgrade":buy_upgrade(str(value))
		"reset":
			distance=0
			speed=0
			accel=0
			comfort=100
			target_station=1
			current_station=0
			leg_start=0
			leg_length=world.stations[1].distance
			mode="drive"
			service_pending=false
			paused=false
			power_pressed=false
			brake_pressed=false
			broken=false
			streak=1
			door_open=0
			emit_event("subtitle",{"text":"A fresh start at Saltlight. Take your time.","kind":"welcome"})
	send_hud()

func _unhandled_key_input(event):
	if OS.has_feature("web"):return
	if not event is InputEventKey or not event.pressed or event.echo:return
	match event.keycode:
		KEY_ENTER:
			if mode=="intro":command("start")
		KEY_SPACE:command("doors")
		KEY_C:command("view")
		KEY_R:
			if mode=="workshop":command("return")
			else:command("workshop")
		KEY_1:
			if mode=="workshop":buy_upgrade("hearth")
		KEY_2:
			if mode=="workshop":buy_upgrade("companion")
		KEY_ESCAPE,KEY_P:command("pause",not paused)

func _process(delta):
	var queued=web_commands
	web_commands=[]
	for data in queued:command(str(data.get("action","")),data.get("value",true))
	var dt=min(delta,.5)
	clock+=dt
	if OS.has_feature("web") and not light_graphics and Time.get_ticks_msec()-graphics_start>9000 and Engine.get_frames_per_second()<24:
		light_graphics=true
		world.use_light_graphics()
		get_viewport().scaling_3d_scale=.65
	if not paused:
		# Fixed-size substeps preserve acceleration and docking at slower rendering rates.
		var steps=max(1,ceili(dt/.025))
		var step_dt=dt/steps
		for i in range(steps):
			if mode=="drive":drive(step_dt)
			elif mode=="boarding":boarding(step_dt)
			elif mode=="upgrading":animate_upgrade(step_dt)
			elif mode=="exitshop":leave_workshop(step_dt)
	place_tram(dt)
	move_camera(dt)
	hud_time+=delta
	if hud_time>.10:
		hud_time=0
		send_hud()

func drive(dt):
	var power=power_pressed or Input.is_physical_key_pressed(KEY_W) or Input.is_physical_key_pressed(KEY_UP)
	var brake=brake_pressed or Input.is_physical_key_pressed(KEY_S) or Input.is_physical_key_pressed(KEY_DOWN)
	var p=fposmod(distance,world.length)/world.length
	var wind_zone=(p>.17 and p<.40) or (p>.65 and p<.77)
	wind=lerpf(wind,(1.6+sin(clock*1.4)*.8) if wind_zone else 0.0,dt*1.5)
	var frame=world.frame(distance)
	var forward=-frame.basis.z
	var slope=forward.y
	var desired=2.05 if power else -.38
	if brake:desired=-5.1
	desired-=slope*3.2
	if speed<.01 and not power:desired=min(0,desired)
	if speed>=12.78 and desired>0:desired=0
	var remaining=remaining_distance()
	# A fail-safe station brake catches an overspeed arrival; manual gentle braking earns the bonus.
	if remaining>2 and remaining<45 and speed>sqrt(max(remaining-.45,0)*5.8):
		desired=min(desired,-3.3)
		if not safe_stop:
			safe_stop=true
			emit_event("subtitle",{"text":"Station brake applied. Ease in earlier for a softer arrival.","kind":"notice"})
	# Dock assist creeps the final two metres instead of letting a careful driver stall short.
	if remaining<2:desired=(max(.18,remaining*.65)-speed)*2
	accel=move_toward(accel,desired,dt*2.6)
	speed=clampf(speed+accel*dt,0,12.8)
	var travel=min(speed*dt,max(0,remaining-.12))
	distance+=travel
	var before=-world.frame(distance-2).basis.z
	var after=-world.frame(distance+2).basis.z
	var curvature=before.signed_angle_to(after,Vector3.UP)/4.0
	lateral=curvature*speed*speed
	var shock=abs(accel-previous_accel)/max(dt,.001)
	previous_accel=accel
	var damping=.66 if upgrades.companion else 1.0
	var discomfort=max(0.0,abs(lateral)-2.0)*2.4
	discomfort+=max(0.0,-accel-2.7)*2.2
	discomfort+=max(0.0,accel-1.85)*.65
	discomfort+=max(0.0,speed-6.8)*wind*.28
	if shock>5:discomfort+=1.5
	discomfort*=damping
	if discomfort>.6:
		comfort-=discomfort*dt
		smooth_time=0
	else:
		comfort+=dt*1.1
		smooth_time+=dt
	comfort=clampf(comfort,8,100)
	if comfort<55 and not broken:
		broken=true
		streak=0
		emit_event("subtitle",{"text":"Streak broken. Find your balance to rebuild your tips.","kind":"notice"})
	elif broken and smooth_time>8 and comfort>70:
		broken=false
		streak=1
		emit_event("subtitle",{"text":"Found your balance. Your streak is growing again.","kind":"welcome"})
	if remaining_distance()<.4 and speed<.65:
		arrive()
		return
	if power and speed<.1 and remaining<.5:arrive()

func remaining_distance() -> float:
	return max(0.0,leg_length-(distance-leg_start))

func arrive():
	if mode!="drive":return
	speed=0
	accel=0
	current_station=target_station
	mode="docked"
	service_pending=true
	journeys+=1
	var smooth=comfort>=72 and not safe_stop
	var reward=75 if smooth else 35
	coins+=reward
	if smooth:streak+=1
	emit_event("arrival",{"station":world.stations[current_station].name,"reward":reward,"smooth":smooth,"comfort":roundi(comfort)})
	emit_event("subtitle",{"text":"A lovely arrival. +75 in fares and tips." if smooth else "Welcome in. +35 in fares. Open the doors when you're ready.","kind":"arrival"})
	save_game()

func open_doors():
	mode="boarding"
	service_time=0
	passengers=max(4,passengers-5)
	emit_event("subtitle",{"text":"Doors opening — "+world.stations[current_station].name,"kind":"boarding"})
	emit_event("bell",{})

func boarding(dt):
	service_time+=dt
	door_open=move_toward(door_open,1.0,dt*1.8)
	var queue=world.waiting[current_station]
	for i in range(queue.size()):
		var f=queue[i]
		var phase=clampf((service_time-.8-float(i)*.48)/1.5,0,1)
		f.node.position=f.home.lerp(Vector3(1.0,.98,.8),phase)
		f.node.rotation.y=-PI*.5
		f.node.position.y+=sin(phase*PI*8)*.045
		f.node.visible=phase<.98
	if service_time-dt<1.8 and service_time>=1.8:
		emit_event("subtitle",{"text":"Please wait… a few more neighbours are coming aboard.","kind":"boarding"})
	if service_time-dt<4.5 and service_time>=4.5:
		passengers=13 if current_station==1 else 12
	if service_time-dt<5.4 and service_time>=5.4:
		service_pending=false
		comfort=min(100,comfort+12)
		emit_event("subtitle",{"text":"All aboard. Ready when you are.","kind":"welcome"})

func depart():
	if mode=="boarding" and service_time<5.4:return
	mode="drive"
	service_pending=false
	target_station=1-current_station
	leg_start=distance
	var destination=float(world.stations[target_station].distance)
	leg_length=fposmod(destination-fposmod(distance,world.length),world.length)
	if leg_length<20:leg_length=world.length
	safe_stop=false
	comfort=min(100,comfort+8)
	for f in world.waiting[current_station]:
		f.node.position=f.home
		f.node.visible=true
	emit_event("subtitle",{"text":"Next stop: "+world.stations[target_station].name+".","kind":"welcome"})

func place_tram(dt):
	var f=world.frame(distance)
	tram.transform=f
	tram.position.y+=.23+sin(clock*8)*min(speed*.004,.05)
	var sway=sin(clock*2.8)*min(speed*.002,.023)
	var roll=clampf(-lateral*.022+sin(clock*1.3)*wind*.01,-.17,.17)+sway
	tram.rotate_object_local(Vector3.FORWARD,roll)
	if mode!="boarding":door_open=move_toward(door_open,0,dt*1.5)
	for i in range(door_nodes.size()):door_nodes[i].position.z=(.65 if i==0 else -.65)*door_open

func move_camera(dt):
	var aspect = get_viewport().get_visible_rect().size.x / max(1.0,get_viewport().get_visible_rect().size.y)
	cam.fov = 66 if aspect<.8 else 51
	var desired: Vector3
	var focus: Vector3
	if mode in ["workshop","upgrading","exitshop"]:
		cam.projection=Camera3D.PROJECTION_ORTHOGONAL
		cam.size=35
		desired=world.workshop+Vector3(25,27,31)
		focus=world.workshop+Vector3(2,1,-.6)
		if aspect<.8:focus=world.workshop+Vector3(2,-6.5,-.6)
	else:
		cam.projection=Camera3D.PROJECTION_PERSPECTIVE
		var f=world.frame(distance)
		var forward=-f.basis.z
		var right=f.basis.x
		var look=angle_input
		if Input.is_physical_key_pressed(KEY_LEFT) or Input.is_physical_key_pressed(KEY_A):look=-1
		if Input.is_physical_key_pressed(KEY_RIGHT) or Input.is_physical_key_pressed(KEY_D):look=1
		var side=9.5+look*5
		if view==1:
			desired=tram.position+right*3.8-forward*3.4+Vector3(0,3.2,0)
			focus=tram.position+forward*12+Vector3(0,2.2,0)
		elif view==2:
			desired=tram.position+right*(side*1.6)-forward*24+Vector3(0,16,0)
			focus=tram.position+forward*5+Vector3(0,1,0)
		else:
			desired=tram.position+right*side-forward*15.5+Vector3(0,8.8,0)
			focus=tram.position+forward*3.6+Vector3(0,1.3,0)
		if mode=="intro":
			desired=tram.position+right*17-forward*22+Vector3(0,10,0)
			focus=tram.position+forward*2+Vector3(0,1.1,0)
	cam.position=cam.position.lerp(desired,1-exp(-dt*2.5))
	cam.look_at(focus,Vector3.UP)
	if mode=="drive":cam.rotate_object_local(Vector3.FORWARD,lateral*.002+sin(clock*5)*speed*.00016)

func can_workshop() -> bool:
	return mode in ["intro","docked","workshop"] or (mode=="drive" and speed<.5 and distance-leg_start<2) or (mode=="boarding" and service_time>=5.4)

func enter_workshop():
	if not can_workshop():
		emit_event("subtitle",{"text":"Oliver's workshop is available while stopped at a station.","kind":"notice"})
		return
	workshop_return_mode=mode
	speed=0
	accel=0
	mode="workshop"
	world.shop_tram.position=world.workshop+Vector3(0,.1,-.5)
	apply_upgrades(world.shop_tram)
	emit_event("subtitle",{"text":"Welcome to Oliver's home island.","kind":"workshop"})

func buy_upgrade(part: String):
	if mode!="workshop" or not upgrades.has(part) or upgrades[part]:return
	var price=50 if part=="hearth" else 75
	if coins<price:
		emit_event("subtitle",{"text":"A few more fares will cover this one.","kind":"notice"})
		return
	coins-=price
	upgrade=part
	upgrade_time=0
	mode="upgrading"
	emit_event("subtitle",{"text":"Hearth leaves — Lifting the old part" if part=="hearth" else "Little Companion — Preparing the tram","kind":"workshop"})

func animate_upgrade(dt):
	upgrade_time+=dt
	var progress=clampf(upgrade_time/6.0,0,1)
	world.crane.position.y=world.workshop.y+4.8+sin(progress*PI)*1.3
	if shop_roof and upgrade=="hearth":
		shop_roof.position.y=sin(progress*PI)*1.6
		shop_roof.rotation.z=sin(progress*TAU)*.035
	if progress>.55 and not upgrades[upgrade]:
		upgrades[upgrade]=true
		apply_upgrades(world.shop_tram)
	if progress>=1:
		upgrades[upgrade]=true
		if shop_roof:
			shop_roof.position.y=0
			shop_roof.rotation.z=0
		apply_upgrades(tram)
		mode="workshop"
		emit_event("upgrade_done",{"part":upgrade})
		emit_event("subtitle",{"text":"Fresh from the Cloudworks. Made with a little care.","kind":"welcome"})
		save_game()

func leave_workshop(dt):
	exit_time+=dt
	world.shop_tram.position.z+=dt*(1.3+exit_time*1.1)
	if exit_time>2.8:
		mode=workshop_return_mode
		if mode=="intro":mode="drive"
		if mode=="boarding":mode="docked"
		emit_event("subtitle",{"text":"All aboard. Next stop: "+world.stations[target_station].name+".","kind":"welcome"})

func apply_upgrades(root: Node3D):
	var vines=find_part(root,"Vines")
	var luggage=find_part(root,"Luggage")
	var lanterns=find_part(root,"Lanterns")
	if vines:vines.visible=upgrades.hearth
	if luggage:luggage.visible=upgrades.companion
	if lanterns:lanterns.visible=upgrades.companion
	if upgrades.hearth:
		var r=find_part(root,"Roof")
		if r:
			for c in r.get_children():
				if c is MeshInstance3D:
					var m=StandardMaterial3D.new()
					m.albedo_color=Color("47754b")
					m.roughness=.55
					c.material_override=m

func save_game():
	if not OS.has_feature("web"):return
	var data=JSON.stringify({"coins":coins,"journeys":journeys,"upgrades":upgrades})
	JavaScriptBridge.eval("localStorage.setItem('saltlight-save-v1',"+JSON.stringify(data)+");",true)

func emit_event(type: String, data: Dictionary):
	if OS.has_feature("web"):
		JavaScriptBridge.eval("window.saltlightEvent && window.saltlightEvent("+JSON.stringify(type)+","+JSON.stringify(data)+");",true)

func send_hud():
	var progress=clampf((distance-leg_start)/max(leg_length,.01),0,1)
	var remaining=remaining_distance()
	var status="Steady"
	if wind>.65:status="Crosswind"
	if remaining<50 and mode=="drive":status="Station approach"
	var data={"mode":mode,"paused":paused,"speed":speed*3.6,"comfort":comfort,"coins":coins,"streak":streak,"passengers":passengers,"journeys":journeys,"destination":world.stations[target_station].name,"origin":world.stations[1-target_station].name,"station":world.stations[current_station].name,"remaining":remaining,"progress":progress,"condition":status,"wind":wind,"lateral":lateral,"canWorkshop":can_workshop(),"servicePending":service_pending,"boardingTime":service_time,"upgrades":upgrades,"upgrade":upgrade,"upgradeProgress":clampf(upgrade_time/6,0,1),"view":view}
	if OS.has_feature("web"):
		data["fps"]=Engine.get_frames_per_second()
		data["drawCalls"]=RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_DRAW_CALLS_IN_FRAME)
		JavaScriptBridge.eval("window.saltlightState && window.saltlightState("+JSON.stringify(data)+");",true)
	elif native_label:
		native_label.text="SALTLIGHT / THE COASTAL LINE\n%s · %02d km/h · %d/16 aboard\nComfort %d%% · %d coins · Streak %d\nW Power · S Brake · C View · Space Doors · R Workshop\n%s" % [data.destination,roundi(speed*3.6),passengers,roundi(comfort),coins,streak,"Enter to begin" if mode=="intro" else mode]
