(() => {
  let fixed = 0; try { fixed = Number(localStorage.getItem("__fakeNow") || 0); } catch { return; }
  if (!fixed) return;
  const RealDate = Date;
  const offset = fixed - RealDate.now();
  class FakeDate extends RealDate {
    constructor(...args) { if (args.length === 0) super(RealDate.now() + offset); else super(...args); }
    static now() { return RealDate.now() + offset; }
  }
  window.Date = FakeDate;
})();
