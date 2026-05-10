import { describe, expect, it } from 'vitest';
import { buildColladaObjectGraph, parseCollada } from '../parseCollada';

/** Helper to create a File from text content. */
function makeFile(content: string, name: string): File {
  return new File([content], name, { type: 'application/xml' });
}

describe('parseCollada', () => {
  it('rejects a file that is not COLLADA XML', async () => {
    const file = makeFile('{"this": "is json"}', 'model.dae');
    await expect(parseCollada(file)).rejects.toThrow(
      'does not appear to be a COLLADA',
    );
  });

  it('rejects an empty file', async () => {
    const file = makeFile('', 'model.dae');
    await expect(parseCollada(file)).rejects.toThrow(
      'does not appear to be a COLLADA',
    );
  });

  it('rejects a file with COLLADA tag but no geometry', async () => {
    // Pre-validation passes (string contains "<COLLADA"), but the parser
    // throws once it finds no parts with usable geometry.
    const xml = `<?xml version="1.0"?><COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1"></COLLADA>`;
    const file = makeFile(xml, 'empty.dae');
    await expect(parseCollada(file)).rejects.toThrow();
  });

  it('exports parseCollada as an async function', () => {
    expect(typeof parseCollada).toBe('function');
  });

  /**
   * Regression test for the COLLADA `<unit meter="N"/>` element.
   * This is the contract the rest of the app relies on: anything stored in
   * `Part.size` must be in meters regardless of the file's authoring unit.
   * If a future Three.js upgrade silently breaks `ColladaParser.parseAssetUnit`
   * or stops applying `scene.scale.multiplyScalar(asset.unit)`, this test
   * fires before the bug reaches the BOM.
   */
  it('treats values authored in inches as meters at the boundary', async () => {
    // 36 × 18 × 1 inches authored as a unit-cube scaled to those dimensions,
    // with `<unit meter="0.0254"/>` declaring the file's unit as inches.
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
  <asset>
    <unit meter="0.0254" name="inch"/>
    <up_axis>Y_UP</up_axis>
  </asset>
  <library_effects>
    <effect id="eff"><profile_COMMON><technique sid="t"><lambert>
      <diffuse><color>0.5 0.5 0.5 1</color></diffuse>
    </lambert></technique></profile_COMMON></effect>
  </library_effects>
  <library_materials>
    <material id="mat"><instance_effect url="#eff"/></material>
  </library_materials>
  <library_geometries>
    <geometry id="g"><mesh>
      <source id="pos"><float_array id="pos-a" count="24">
        0 0 0  36 0 0  36 18 0  0 18 0
        0 0 1  36 0 1  36 18 1  0 18 1
      </float_array>
      <technique_common><accessor source="#pos-a" count="8" stride="3">
        <param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/>
      </accessor></technique_common></source>
      <vertices id="v"><input semantic="POSITION" source="#pos"/></vertices>
      <triangles count="12" material="m">
        <input semantic="VERTEX" source="#v" offset="0"/>
        <p>0 1 2 0 2 3 4 6 5 4 7 6 0 4 5 0 5 1 1 5 6 1 6 2 2 6 7 2 7 3 3 7 4 3 4 0</p>
      </triangles>
    </mesh></geometry>
  </library_geometries>
  <library_visual_scenes>
    <visual_scene id="s"><node id="n">
      <instance_geometry url="#g"><bind_material><technique_common>
        <instance_material symbol="m" target="#mat"/>
      </technique_common></bind_material></instance_geometry>
    </node></visual_scene>
  </library_visual_scenes>
  <scene><instance_visual_scene url="#s"/></scene>
</COLLADA>`;

    const graph = await buildColladaObjectGraph(xml);
    expect(graph.parts).toHaveLength(1);

    // 36 × 18 × 1 inches = 0.9144 × 0.4572 × 0.0254 meters.
    const size = graph.parts[0].size;
    const sorted = [size.thickness, size.width, size.length].sort(
      (a, b) => a - b,
    );
    expect(sorted[0]).toBeCloseTo(0.0254, 4); // thickness  =  1"
    expect(sorted[1]).toBeCloseTo(0.4572, 4); // width      = 18"
    expect(sorted[2]).toBeCloseTo(0.9144, 4); // length     = 36"
  });
});
