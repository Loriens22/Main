extends SceneTree
## End-to-end checks: five-stop circuit, single-award fares, boarding, album and workshop.

var game

func _initialize():
	call_deferred("run")

func step(seconds: float):
	for i in range(ceili(seconds*60)):
		game._process(1.0/60.0)

func run():
	game=load("res://main.tscn").instantiate()
	root.add_child(game)
	assert(game.world.length>1500,"The extended line must be a substantial archipelago circuit.")
	assert(game.world.stations.size()==5 and game.world.island_roots.size()==5,"All five distinct villages must be built.")
	assert(game.world.frame(0).origin.distance_to(game.world.frame(game.world.length-.01).origin)<.1,"Closed railway must be continuous.")
	assert(game.find_part(game.tram,"Roof")!=null,"Blender part names must survive import.")
	var clear_glass=false
	for mesh in game.tram.find_children("*","MeshInstance3D",true,false):
		for surface in range(mesh.mesh.get_surface_count()):
			var material=mesh.mesh.surface_get_material(surface)
			if material.resource_name.to_lower().contains("glass"):
				clear_glass=material.transparency==BaseMaterial3D.TRANSPARENCY_ALPHA and material.albedo_color.a<.5
	assert(clear_glass,"The cabin and driver's view must use clear glass.")
	game.command("start")
	game.command("power",true)
	for i in range(12000):
		game._process(1.0/60.0)
		if game.mode=="docked":break
	assert(game.mode=="docked" and game.current_station==1,"Power and station safety braking must reach Mango Tide.")
	assert(game.coins==215 and game.journeys==1,"A station arrival must award fares exactly once.")
	assert(game.comfort<100,"Overspeed driving must affect passenger comfort.")
	game.command("power",false)
	game.command("doors")
	step(6)
	assert(game.passengers==13 and not game.service_pending,"Boarding must complete before departure.")
	game.command("doors")
	assert(game.mode=="drive" and game.target_station==2,"Mango Tide must depart toward the mushroom village.")
	for station in [2,3,4,0]:
		var count=game.journeys
		for i in range(30000):
			var remaining=game.remaining_distance()
			var desired=min(6.4,sqrt(max(.05,remaining-.15)*1.5))
			game.command("power",game.speed<desired-.15)
			game.command("brake",game.speed>desired+.35)
			game._process(1.0/60.0)
			if game.mode=="docked":break
		assert(game.mode=="docked" and game.current_station==station,"Every island must be reachable in order.")
		assert(game.journeys==count+1,"Each leg must count as exactly one journey.")
		var fares=game.coins
		game.arrive()
		assert(game.coins==fares,"A second arrival call must never duplicate fares.")
		game.command("power",false)
		game.command("brake",false)
		game.command("doors")
		step(6)
		assert(game.passengers==game.world.stations[station].passengers and not game.service_pending,"Each village must board its own neighbours.")
		if station!=0:
			game.command("doors")
			assert(game.target_station==(station+1)%5,"The line must progress around all five stations.")
	assert(game.journeys==5 and game.completed_album,"A complete circuit must collect the coastal album.")
	assert(not false in game.visited,"Every station stamp must be collected.")
	game.command("power",false)
	game.command("brake",false)
	game.command("workshop")
	assert(game.mode=="workshop","The workshop must be reachable from a station.")
	var wallet=game.coins
	game.command("upgrade","hearth")
	step(6.2)
	assert(game.upgrades.hearth and game.coins==wallet-50,"Hearth fitting must complete and charge once.")
	assert(game.find_part(game.tram,"Vines").visible,"Fitting must change the actual tram.")
	game.command("upgrade","companion")
	step(6.2)
	assert(game.upgrades.companion and game.find_part(game.tram,"Lanterns").visible,"Companion fitting must add lanterns.")
	game.command("return")
	step(3)
	assert(game.mode=="docked","Workshop departure must return to the station.")
	game.command("doors")
	assert(game.target_station==1 and game.mode=="drive","The completed circuit must continue as a playable evening line.")
	var held_distance=game.distance
	game.command("pause",true)
	step(1)
	assert(game.distance==held_distance,"Pausing must stop the tram simulation.")
	game.command("preview",2)
	step(3)
	assert(game.distance==held_distance and game.cam.position.distance_to(game.world.island_roots[2].global_position)<80,"A live village preview must preserve the journey.")
	game.command("preview_clear")
	game.command("pause",false)
	print("PASS: five unique villages, continuous full circuit, comfort, single-award fares, local passengers, album, two visible upgrades, workshop return, pause and non-destructive live previews.")
	quit(0)
