import test from 'node:test';
import assert from 'node:assert/strict';
import {createRegion, registerRegion, resolveRegion, setRegionModule, updateRegionPresentation} from '../../region-platform/region-config.mjs';

const dallas = {slug:'dallas',status:'live',modules:{directory:true,coupons:true},content:{businesses:[{id:1}]}};
const input = {name:'Houston',slug:'houston',state:'TX',center:{lat:29.7604,lng:-95.3698}};

test('create an empty, unpublished region with default modules',()=>{
  const region=createRegion(input);
  assert.equal(region.status,'draft');
  assert.equal(region.map.center.lat,29.7604);
  assert.deepEqual(region.content,{businesses:[],posts:[],coupons:[],events:[],ads:[]});
  assert.equal(region.modules.directory,true);
  assert.equal(region.modules.reservations,false);
});

test('region registration never mutates Dallas',()=>{
  const original=JSON.stringify(dallas);
  const regions=registerRegion([dallas],input);
  assert.equal(regions.length,2);
  assert.equal(JSON.stringify(dallas),original);
  assert.deepEqual(regions[0],dallas);
  assert.notStrictEqual(regions[0],dallas);
  assert.throws(()=>registerRegion(regions,input),/REGION_ALREADY_EXISTS/);
});

test('region presentation is isolated from other regions',()=>{
  const houston=createRegion(input);
  const customized=updateRegionPresentation(houston,{preset:'houston-city',primaryColor:'#112233',layout:'community',sections:['community','map']});
  assert.equal(houston.theme.primaryColor,null);
  assert.equal(customized.home.layout,'community');
  assert.equal(dallas.modules.directory,true);
});

test('module configuration is independent and validates dependencies',()=>{
  const houston=createRegion(input);
  const customized=setRegionModule(houston,'community',false);
  assert.equal(customized.modules.community,false);
  assert.equal(houston.modules.community,true);
  assert.throws(()=>setRegionModule(houston,'unrecognized',true),/UNKNOWN_REGION_MODULE/);
  assert.throws(()=>setRegionModule(dallas,'directory',false),/MODULE_DEPENDENCY_CONFLICT/);
});

test('invalid inputs are rejected and disabled regions hidden',()=>{
  assert.throws(()=>createRegion({...input,slug:'../x'}),/INVALID_REGION_SLUG/);
  assert.throws(()=>createRegion({...input,center:{lat:999,lng:2}}),/INVALID_MAP_CENTER/);
  assert.throws(()=>updateRegionPresentation(createRegion(input),{logoUrl:'javascript:alert(1)'}),/INVALID_LOGO/);
  const region=createRegion(input);
  assert.equal(resolveRegion([region],'houston').slug,'houston');
  region.status='disabled';
  assert.equal(resolveRegion([region],'houston'),null);
});
