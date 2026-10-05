extends SceneTree
## End-to-end simulation checks: rail continuity, both stations, boarding and fitted parts.

var game

func _initialize():
	call_deferred("run")

func step(seconds: float):
	for i in range(ceili(seconds*60)):
		game._process(1.0/60.0)

func run():
	game=load("res://main.tscn").instantiate()
	root.add_child(game)
	assert(game.world.length>600,"The coastal loop must connect both islands.")
	assert(game.world.frame(0).origin.distance_to(game.world.frame(game.world.length-.01).origin)<.1,"Closed railway must be continuous.")
	assert(game.find_part(game.tram,"Roof")!=null,"Blender part names must survive import.")
	game.command("start")
	game.command("power",true)
	for i in range(12000):
		game._process(1.0/60.0)
		if game.mode=="docked":break
	assert(game.mode=="docked" and game.current_station==1,"Power and station safety braking must reach Mango Tide.")
	assert(game.coins>=215,"A station arrival must earn fares.")
	assert(game.comfort<100,"Overspeed driving must affect passenger comfort.")
	game.command("power",false)
	game.command("doors")
	step(6)
	assert(game.passengers==13 and not game.service_pending,"Boarding must complete before departure.")
	game.command("doors")
	assert(game.mode=="drive" and game.target_station==0,"The return route must target Saltlight.")
	for i in range(20000):
		var remaining=game.remaining_distance()
		var desired=min(6.4,sqrt(max(.05,remaining-.15)*1.5))
		game.command("power",game.speed<desired-.15)
		game.command("brake",game.speed>desired+.35)
		game._process(1.0/60.0)
		if game.mode=="docked":break
	assert(game.mode=="docked" and game.current_station==0,"The return journey must reach Saltlight.")
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
	print("PASS: continuous rails, both routes, comfort, fares, boarding, two visible upgrades, and workshop return.")
	quit(0)
