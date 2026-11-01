// The hero buildings modelled in Blender (tools/blender/hero/*.py): GLB, baked AO map and placement of each.
import mall_glb from './mall.glb';
import mall_ao from './mall_ao.webp';
import mall_meta from './mall.json';
import billa_glb from './billa.glb';
import billa_ao from './billa_ao.webp';
import billa_meta from './billa.json';
import millennium_glb from './millennium.glb';
import millennium_ao from './millennium_ao.webp';
import millennium_meta from './millennium.json';
import btv_glb from './btv.glb';
import btv_ao from './btv_ao.webp';
import btv_meta from './btv.json';

export default {
  mall: { glb: mall_glb, ao: mall_ao, meta: mall_meta },
  billa: { glb: billa_glb, ao: billa_ao, meta: billa_meta },
  millennium: { glb: millennium_glb, ao: millennium_ao, meta: millennium_meta },
  btv: { glb: btv_glb, ao: btv_ao, meta: btv_meta },
};
