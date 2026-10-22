"""Default carriageway widths (m) per road class: (oneway, twoway).
Shared by build_route.py and build_world.py so lane offsets match geometry."""
WIDTH = {'trunk': (11.0, 19.0), 'primary': (10.0, 15.0), 'secondary': (7.5, 12.5), 'tertiary': (6.8, 9.5),
         'unclassified': (5.5, 7.0), 'residential': (5.0, 6.5), 'living_street': (4.5, 5.5),
         'service': (3.6, 4.6), 'unknown': (4.0, 5.0), 'pedestrian': (5.0, 6.0), 'footway': (2.2, 2.2),
         'path': (1.6, 1.6), 'cycleway': (2.0, 2.4), 'steps': (2.5, 2.5), 'track': (3.0, 3.0)}


def road_width(cls, oneway, width_rules=None, subclass=None):
    w = None
    for wr in width_rules or []:
        if wr['between'] is None and wr['value'] and 2 <= wr['value'] <= 30:
            w = wr['value']
    if w is None:
        w = WIDTH[cls][0 if oneway else 1]
        if subclass == 'crosswalk':
            w = 3.0
        if subclass in ('driveway', 'parking_aisle'):
            w = 3.4
    return w
