"""Reproducible woodland assets. Run with Blender --background --python this_file.
No downloaded assets. Geometry, materials and lighting are authored here.
"""
import bpy, math, random, sys, subprocess, shutil
from pathlib import Path
from mathutils import Vector
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'site/assets'
OUT.mkdir(parents=True, exist_ok=True)
random.seed(29)

def linear(c):
    return c/12.92 if c <= .04045 else ((c+.055)/1.055)**2.4

def mat(name, color, rough=.7, noise=0):
    color=tuple(linear(c) for c in color)
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    nodes=m.node_tree.nodes; p=nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1); p.inputs['Roughness'].default_value=rough
    if noise:
        n=nodes.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value=18
        uv=nodes.new('ShaderNodeTexCoord'); m.node_tree.links.new(uv.outputs['Object'],n.inputs['Vector'])
        ramp=nodes.new('ShaderNodeValToRGB')
        ramp.color_ramp.elements[0].color=(*(c*.66 for c in color),1)
        ramp.color_ramp.elements[1].color=(*(min(c*1.22,1) for c in color),1)
        m.node_tree.links.new(n.outputs['Fac'],ramp.inputs[0]); m.node_tree.links.new(ramp.outputs[0],p.inputs['Base Color'])
        b=nodes.new('ShaderNodeBump'); b.inputs['Strength'].default_value=noise; b.inputs['Distance'].default_value=.065
        m.node_tree.links.new(n.outputs['Fac'],b.inputs['Height']); m.node_tree.links.new(b.outputs[0],p.inputs['Normal'])
    return m

def scene(size, transparent=False):
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    s=bpy.context.scene; s.render.engine='CYCLES'; s.cycles.samples=28; s.cycles.use_denoising=True
    s.render.resolution_x=size; s.render.resolution_y=size; s.render.resolution_percentage=100
    s.render.image_settings.file_format='PNG'; s.render.image_settings.color_mode='RGBA'; s.render.film_transparent=transparent
    s.world.color=(.28,.32,.25)
    s.view_settings.view_transform='AgX'
    for loc,power,area,col in [((-3,-4,9),1500,5,(1,.89,.68)),((5,3,7),850,7,(.75,.87,1))]:
        bpy.ops.object.light_add(type='AREA',location=loc); o=bpy.context.object; o.data.energy=power; o.data.shape='DISK'; o.data.size=area; o.data.color=col
        o.rotation_euler=(Vector((0,0,0))-o.location).to_track_quat('-Z','Y').to_euler()
    return s

def camera(loc, target, scale):
    bpy.ops.object.camera_add(location=loc); c=bpy.context.object; c.rotation_euler=(Vector(target)-c.location).to_track_quat('-Z','Y').to_euler(); c.data.type='ORTHO'; c.data.ortho_scale=scale; bpy.context.scene.camera=c

def ball(name, loc, scale, material, detail=2):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=detail,radius=1,location=loc)
    o=bpy.context.object; o.name=name; o.scale=scale; o.data.materials.append(material)
    for f in o.data.polygons:f.use_smooth=True
    return o

def curve(name, points, radius, material):
    c=bpy.data.curves.new(name,'CURVE'); c.dimensions='3D'; c.bevel_depth=radius; c.bevel_resolution=2
    p=c.splines.new('BEZIER'); p.bezier_points.add(len(points)-1)
    for b,co in zip(p.bezier_points,points): b.co=co; b.handle_left_type='AUTO'; b.handle_right_type='AUTO'
    o=bpy.data.objects.new(name,c); bpy.context.collection.objects.link(o); o.data.materials.append(material); return o

def leaf(loc, direction, length, width, material):
    d=Vector(direction).normalized(); side=Vector((-d.y,d.x,.05)).normalized(); origin=Vector(loc)
    verts=[]
    for t,w in [(0,0),(.23,.72),(.5,1),(.77,.64),(1,0)]:
        center=origin+d*length*t+Vector((0,0,math.sin(t*math.pi)*length*.18))
        for k in [-1,0,1]: verts.append(center+side*w*width*k+Vector((0,0,.035 if k==0 else 0)))
    faces=[]
    for i in range(4):
        for j in range(2): a=i*3+j; faces.append((a,a+1,a+4,a+3))
    mesh=bpy.data.meshes.new('leaf'); mesh.from_pydata(verts,[],faces); mesh.materials.append(material)
    ob=bpy.data.objects.new('leaf',mesh); bpy.context.collection.objects.link(ob)
    for f in mesh.polygons:f.use_smooth=True

def render(name):
    bpy.context.scene.render.filepath=str(OUT/name); bpy.ops.render.render(write_still=True)
    encoder=shutil.which('cwebp')
    if not encoder: raise RuntimeError('Install cwebp to encode the browser assets')
    subprocess.run([encoder,'-quiet','-q','88',str(OUT/name),'-o',str((OUT/name).with_suffix('.webp'))],check=True)
    (OUT/name).unlink()

# Soft moss floor: surface noise is deliberately subtle at habitat scale.
if '--sprites-only' not in sys.argv:
    scene(1280); camera((0,-7,16),(0,0,0),12.7)
    moss=mat('Living moss',(.24,.32,.105),noise=.28)
    bank=mat('Velvet moss hummocks',(.31,.40,.15),noise=.32)
    soil=mat('Fine woodland soil',(.29,.24,.15),noise=.5)
    stones=[mat('Warm river stone '+str(i),c,noise=.18) for i,c in enumerate([(.32,.35,.27),(.44,.45,.34),(.55,.52,.40)])]
    leaves=[mat('Fern '+str(i),c,noise=.1) for i,c in enumerate([(.16,.27,.075),(.30,.42,.105),(.43,.53,.18),(.23,.36,.13)])]
    bpy.ops.mesh.primitive_plane_add(size=200); bpy.context.object.data.materials.append(moss)
    # Winding exposed earth, kept narrow so there is generous room to roam.
    for i in range(48):
        x=-8+i*.34; y=.9*math.sin(x*.57)+.4
        ball('Forest trail',(x,y,-.12),(.65,.44,.16),soil)
    # Uneven moss cushions hug the perimeter rather than obstructing the clearing.
    for i in range(76):
        x=random.uniform(-7.5,7.5); y=random.uniform(-8,8)
        if abs(x)<4.3 and abs(y)<4.7: continue
        ball('Moss bank',(x,y,-.15),(random.uniform(.4,1.4),random.uniform(.5,1.25),random.uniform(.22,.5)),bank)
    for i in range(130):
        x=random.uniform(-7,7); y=random.uniform(-8,8); r=random.uniform(.035,.16)
        if abs(x)<4 and abs(y)<4:r*=.55
        ball('Pebble',(x,y,r*.25),(r*1.5,r,r*.65),random.choice(stones))
    # Frond clusters with paired leaflets and curved central stems.
    for x,y,scale in [(-5.8,4,1.2),(-4.4,5.8,1),(-6,0,.9),(-5,-4,1.15),(-3,-6,1),(.8,6.6,1.2),(5,5.5,1.2),(6,1.8,1.3),(5.4,-3.7,1.15),(3,-6.2,1.3),(-6,7,1.4),(6,-7,1.4)]:
        for frond in range(7):
            ang=frond*2*math.pi/7+random.random()*.5
            d=Vector((math.cos(ang),math.sin(ang),0)); sideways=Vector((-d.y,d.x,0))
            L=random.uniform(1.15,2)*scale
            pts=[Vector((x,y,.12))+d*(L*t)+Vector((0,0,.8*scale*math.sin(t*math.pi*.8))) for t in [0,.33,.66,1]]
            curve('Fern spine',pts,.013,leaves[0])
            for j in range(1,9):
                t=j/10; p=Vector((x,y,.12))+d*L*t+Vector((0,0,.8*scale*math.sin(t*math.pi*.8)))
                for sign in [-1,1]:leaf(p,sideways*sign*.9+d*.4,(.36*(1-t)+.1)*scale,.075*scale,leaves[(j+frond)%4])
            leaf(pts[-1],d,.26*scale,.065*scale,leaves[2])
    # Broad sorrel leaves, young grass and small woodland flowers.
    petal=mat('Ivory petals',(.86,.82,.58)); pollen=mat('Pollen',(.55,.32,.06)); stem=leaves[0]
    for i in range(65):
        x=random.uniform(-7,7);y=random.uniform(-7,7)
        if abs(x)<4.3 and abs(y)<4.5 and random.random()<.94:continue
        for j in range(random.randint(3,5)):
            angle=random.random()*math.tau; L=random.uniform(.3,.8)
            leaf((x,y,.03),(math.cos(angle),math.sin(angle),.5),L,L*.23,random.choice(leaves))
        if i%4==0:
            z=random.uniform(.3,.5); curve('Flower stem',[(x,y,0),(x+.05,y,z)],.014,stem)
            for j in range(5):
                a=j*math.tau/5;ball('Petal',(x+math.cos(a)*.08,y+math.sin(a)*.08,z),(.075,.05,.028),petal)
            ball('Pollen',(x,y,z+.02),(.038,.038,.03),pollen)
    for i in range(240):
        x=random.uniform(-6.5,6.5); y=random.uniform(-6.5,6.5)
        if abs(y-(.9*math.sin(x*.57)+.4))<.5:continue
        for j in range(3):
            a=random.random()*math.tau
            leaf((x,y,.015),(math.cos(a),math.sin(a),1),random.uniform(.07,.18),.018,random.choice(leaves))
    render('woodland.png')

# Four little animals, with softly irregular fur and personality-specific ears.
for soul,color in [('wary',(49/255,67/255,82/255)),('bold',(231/255,60/255,23/255)),('paranoid',(82/255,102/255,119/255)),('curious',(160/255,174/255,185/255))]:
    random.seed(100 + ['wary','bold','paranoid','curious'].index(soul))
    scene(320,True);camera((3,-8,5.1),(0,0,1),4.15)
    fur=mat(soul+' fur',color,noise=.22)
    light=mat('Soft muzzle',tuple(min(1,c*.7+.3) for c in color),noise=.07)
    inner=mat('Ear velvet',tuple(c*.6 for c in color),noise=.08)
    eye=mat('Glossy dark eyes',(.026,.032,.025),.15)
    nose=mat('Nose',(.12,.085,.07),.4)
    body=ball('Pear-shaped body',(0,0,.94),(.81,.66,.91),fur,4)
    # Slight asymmetry in the body; smooth geometry with small soft fur scallops.
    for v in body.data.vertices:
        p=v.co; p.x*=1+.07*math.sin(p.z*6+p.y*3);p.y*=1+.025*math.sin(p.x*9)
    ball('Face',(0,-.40,1.38),(.64,.43,.54),fur,3)
    for x in [-.39,.39]:
        ball('Paw',(x,-.29,.22),(.28,.39,.18),inner,3)
        ball('Cheek',(x*.64,-.743,1.19),(.28,.17,.22),light,3)
    ball('Belly',(0,-.57,.75),(.49,.14,.38),light,3)
    ball('Tail',(.63,.39,.57),(.28,.27,.30),fur,3)
    for x in [-.43,.43]:
        if soul=='curious':dims=(.17,.18,.61); z=2.02
        elif soul=='paranoid':dims=(.24,.16,.42);z=1.96
        elif soul=='wary':dims=(.33,.19,.28);z=1.8
        else:dims=(.25,.19,.28);z=1.86
        e=ball('Ear',(x,.01,z),dims,fur,3);e.rotation_euler[1]=(-.32 if x<0 else .32)
        e=ball('Ear inset',(x,-.14,z),tuple(v*.65 for v in dims),inner,3);e.rotation_euler[1]=(-.32 if x<0 else .32)
    for x in [-.27,.27]:
        ball('Eye',(x,-.775,1.49),(.104,.066,.128),eye,3)
        ball('Eye sparkle',(x-.023,-.833,1.535),(.026,.019,.026),mat('Glint',(.95,.96,.86),.2),2)
    ball('Nose',(0,-.895,1.29),(.074,.054,.045),nose,3)
    curve('Small mouth',[(0,-.892,1.265),(0,-.900,1.21),(.07,-.877,1.195)],.012,nose)
    # Fine tapered fur tufts catch the rim light; one mesh keeps scene light.
    vs=[]; fs=[]
    for i in range(950):
        a=random.uniform(0,math.tau);z=random.uniform(-.75,.96);r=math.sqrt(max(0,1-z*z)); n=Vector((r*math.cos(a),r*math.sin(a),z))
        if n.y<-.55:continue
        p=Vector((n.x*.81,n.y*.66,n.z*.91+.94)); side=n.cross(Vector((0,0,1))).normalized()*.012
        idx=len(vs);vs.extend([p-side,p+side,p+n*random.uniform(.03,.09)]);fs.append((idx,idx+1,idx+2))
    mesh=bpy.data.meshes.new('Fur');mesh.from_pydata(vs,[],fs);mesh.materials.append(fur);ob=bpy.data.objects.new('Fur',mesh);bpy.context.collection.objects.link(ob)
    render(soul+'.png')

    # Fixed lighting, rotating model: 16 headings, neutral + four walking poses.
    from mathutils import Matrix
    objects=[o for o in bpy.context.scene.objects if o.type not in {'CAMERA','LIGHT'}]
    originals={o.name:o.matrix_world.copy() for o in objects}
    camera_obj=bpy.context.scene.camera
    camera_obj.location=(0,-8,5.1)
    camera_obj.rotation_euler=(Vector((0,0,1))-camera_obj.location).to_track_quat('-Z','Y').to_euler()
    bpy.context.scene.render.resolution_x=128; bpy.context.scene.render.resolution_y=128
    bpy.context.scene.cycles.samples=16
    import array
    pixels=array.array('f',[0.0])*(2048*640*4)
    temp=OUT/(soul+'-frame.png')
    for row in range(5):
        phase=(row-1)*math.pi/2
        for direction in range(16):
            yaw=Matrix.Rotation(math.pi/2-direction*math.tau/16,4,'Z')
            for o in objects:
                pose=originals[o.name].copy()
                if row:
                    if o.name.startswith('Paw'):
                        side=1 if pose.translation.x>0 else -1
                        step=math.sin(phase)*side
                        pose.translation.y+=step*.15
                        pose.translation.z+=max(0,step)*.12
                    else:
                        pose.translation.z+=.035*math.cos(phase*2)
                        if o.name.startswith('Ear'):pose=pose @ Matrix.Rotation(.05*math.sin(phase),4,'Y')
                o.matrix_world=yaw @ pose
            bpy.context.scene.render.filepath=str(temp)
            bpy.ops.render.render(write_still=True)
            frame=bpy.data.images.load(str(temp),check_existing=False)
            data=array.array('f',[0.0])*(128*128*4);frame.pixels.foreach_get(data)
            # Blender image pixels are bottom-up; SVG atlas rows are top-down.
            for line in range(128):
                dest=((4-row)*128+line)*2048*4+direction*128*4
                pixels[dest:dest+128*4]=data[line*128*4:(line+1)*128*4]
            bpy.data.images.remove(frame)
    atlas=bpy.data.images.new(soul+' walk atlas',width=2048,height=640,alpha=True)
    atlas.pixels.foreach_set(pixels)
    atlas.filepath_raw=str(OUT/(soul+'-walk.png'));atlas.file_format='PNG';atlas.save()
    subprocess.run([shutil.which('cwebp'),'-quiet','-q','86',atlas.filepath_raw,'-o',str(OUT/(soul+'-walk.webp'))],check=True)
    Path(atlas.filepath_raw).unlink();temp.unlink();bpy.data.images.remove(atlas)
