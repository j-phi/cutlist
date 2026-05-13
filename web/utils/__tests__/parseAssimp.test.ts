import { describe, expect, it } from 'vitest';
import { parseAssimp, getFileExtension } from '../parseAssimp';

function makeFile(content: string, name: string): File {
  return new File([content], name, { type: 'application/octet-stream' });
}

/**
 * 36 × 18 × 1 inches authored as inches via `<unit meter="0.0254"/>`.
 * Pins the unit-handling contract: anything stored in `Part.size` must be in
 * meters regardless of authoring unit. If Assimp ever stops applying the
 * COLLADA unit factor this test fires before the bug reaches the BOM.
 */
const INCH_AUTHORED_BOX = `<?xml version="1.0" encoding="UTF-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
  <asset><unit meter="0.0254" name="inch"/><up_axis>Y_UP</up_axis></asset>
  <library_effects><effect id="eff"><profile_COMMON><technique sid="t">
    <lambert><diffuse><color>0.5 0.5 0.5 1</color></diffuse></lambert>
  </technique></profile_COMMON></effect></library_effects>
  <library_materials><material id="mat"><instance_effect url="#eff"/></material></library_materials>
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
  <library_visual_scenes><visual_scene id="s"><node id="n">
    <instance_geometry url="#g"><bind_material><technique_common>
      <instance_material symbol="m" target="#mat"/>
    </technique_common></bind_material></instance_geometry>
  </node></visual_scene></library_visual_scenes>
  <scene><instance_visual_scene url="#s"/></scene>
</COLLADA>`;

/**
 * Same 1 m cube authored as `<polylist>` of quads. SketchUp emits this form
 * for non-triangulated exports; pinned here as a smoke test that Assimp keeps
 * handling it (Three.js's old loader had edge cases that don't apply now).
 */
const QUAD_POLYLIST_CUBE = `<?xml version="1.0" encoding="UTF-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
  <asset><unit meter="1.0" name="meter"/><up_axis>Y_UP</up_axis></asset>
  <library_effects><effect id="eff"><profile_COMMON><technique sid="t">
    <lambert><diffuse><color>0.5 0.5 0.5 1</color></diffuse></lambert>
  </technique></profile_COMMON></effect></library_effects>
  <library_materials><material id="mat"><instance_effect url="#eff"/></material></library_materials>
  <library_geometries>
    <geometry id="g"><mesh>
      <source id="pos"><float_array id="pos-a" count="24">
        0 0 0  1 0 0  1 1 0  0 1 0
        0 0 1  1 0 1  1 1 1  0 1 1
      </float_array>
      <technique_common><accessor source="#pos-a" count="8" stride="3">
        <param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/>
      </accessor></technique_common></source>
      <vertices id="v"><input semantic="POSITION" source="#pos"/></vertices>
      <polylist count="6" material="m">
        <input semantic="VERTEX" source="#v" offset="0"/>
        <vcount>4 4 4 4 4 4</vcount>
        <p>0 1 2 3   4 7 6 5   0 4 5 1   1 5 6 2   2 6 7 3   3 7 4 0</p>
      </polylist>
    </mesh></geometry>
  </library_geometries>
  <library_visual_scenes><visual_scene id="s"><node id="n">
    <instance_geometry url="#g"><bind_material><technique_common>
      <instance_material symbol="m" target="#mat"/>
    </technique_common></bind_material></instance_geometry>
  </node></visual_scene></library_visual_scenes>
  <scene><instance_visual_scene url="#s"/></scene>
</COLLADA>`;

describe('parseAssimp', () => {
  it('imports a DAE and converts authoring units to meters', async () => {
    const graph = await parseAssimp(makeFile(INCH_AUTHORED_BOX, 'box.dae'));
    expect(graph.parts).toHaveLength(1);
    const sorted = [
      graph.parts[0].size.thickness,
      graph.parts[0].size.width,
      graph.parts[0].size.length,
    ].sort((a, b) => a - b);
    expect(sorted[0]).toBe(25_400); // 1" in µm
    expect(sorted[1]).toBe(457_200); // 18" in µm
    expect(sorted[2]).toBe(914_400); // 36" in µm
  });

  it('imports a DAE authored as <polylist> of quads', async () => {
    const graph = await parseAssimp(makeFile(QUAD_POLYLIST_CUBE, 'cube.dae'));
    expect(graph.parts).toHaveLength(1);
    expect(graph.parts[0].size.thickness).toBe(1_000_000);
    expect(graph.parts[0].size.width).toBe(1_000_000);
    expect(graph.parts[0].size.length).toBe(1_000_000);
  });

  it('throws on an unrecognised file extension', async () => {
    await expect(parseAssimp(makeFile('garbage', 'model.xyz'))).rejects.toThrow(
      /Assimp failed to import/,
    );
  });
});

describe('getFileExtension', () => {
  it('returns the lowercase extension without the leading dot', () => {
    expect(getFileExtension('cabinet.DAE')).toBe('dae');
    expect(getFileExtension('model.tar.gz')).toBe('gz');
  });

  it('returns empty string for files without an extension', () => {
    expect(getFileExtension('Makefile')).toBe('');
  });
});
