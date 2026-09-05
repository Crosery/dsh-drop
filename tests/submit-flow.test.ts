import assert from 'node:assert/strict'
import { it } from 'node:test'
import { installSubmitGuard } from '../src/client/submit-guard.ts'

it('splices file-only submissions once, leaves retry text, and disposes listeners', () => {
  const old = Object.fromEntries(['document','Element','HTMLTextAreaElement'].map(k => [k, Object.getOwnPropertyDescriptor(globalThis,k)]))
  // Node EventTarget has different boolean-capture removal semantics from DOM.
  const listeners = new Map<string, EventListener>()
  const doc = {
    addEventListener: (name: string, fn: EventListener) => { listeners.set(name, fn) },
    removeEventListener: (name: string, fn: EventListener) => { if (listeners.get(name) === fn) listeners.delete(name) },
    dispatchEvent: (event: Event) => { listeners.get(event.type)?.(event) },
  }
  class ElementStub { closest() { return this } }
  class TextareaStub extends ElementStub { disabled = false; readOnly = false; expanded = false; getAttribute() { return this.expanded ? 'true' : 'false' } }
  const target = new TextareaStub()
  Object.assign(globalThis,{document:doc, Element:ElementStub, HTMLTextAreaElement:TextareaStub})
  let draft = ''; let submissions = 0; let staged = ['@/tmp/brief.md']; let ready = true
  const release = installSubmitGuard(() => ({sessionId:'demo',draft:()=>draft,setDraft:t=>{draft=t},submit:()=>{submissions++},ready:()=>ready}),()=>staged,()=>{staged=[]})
  const enter = (props = {}) => {
    const e = new Event('keydown',{cancelable:true})
    Object.defineProperties(e,Object.fromEntries(Object.entries({target,key:'Enter',keyCode:13,isComposing:false,shiftKey:false,...props}).map(([k,value])=>[k,{value}])))
    doc.dispatchEvent(e); return e.defaultPrevented
  }
  try {
    assert.equal(enter({shiftKey:true}),false)
    assert.equal(enter({isComposing:true}),false)
    target.readOnly=true; assert.equal(enter(),false); target.readOnly=false
    target.disabled=true; assert.equal(enter(),false); target.disabled=false
    target.expanded=true; assert.equal(enter(),false); target.expanded=false
    ready=false; assert.equal(enter(),false); ready=true
    assert.equal(submissions,0)
    assert.equal(enter(),true)
    assert.equal(draft,'@/tmp/brief.md')
    assert.equal(submissions,1)
    assert.deepEqual(staged,[])
    assert.equal(enter(),false) // native retry sees the retained draft; no duplicate path
    release(); staged=['@/tmp/again.md']; assert.equal(enter(),false)
    assert.equal(submissions,1)
  } finally {
    release()
    for (const [key,descriptor] of Object.entries(old)) {
      if (descriptor) Object.defineProperty(globalThis,key,descriptor)
      else Reflect.deleteProperty(globalThis,key)
    }
  }
})
