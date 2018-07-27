import { Component, Input, Output, ChangeDetectionStrategy, ChangeDetectorRef, EventEmitter, ElementRef, Renderer2, Inject, } from '@angular/core';
import { Router, NavigationEnd, ActivatedRoute } from '@angular/router';
import { DOCUMENT } from '@angular/common';
import { combineLatest } from 'rxjs';
import { filter } from 'rxjs/operators';
import { ReuseTabService } from './reuse-tab.service';
import { ReuseTabMatchMode, } from './interface';
import { ReuseTabContextService } from './reuse-tab-context.service';
export class ReuseTabComponent {
    // endregion
    constructor(srv, cd, router, route, el, render, doc) {
        this.srv = srv;
        this.cd = cd;
        this.router = router;
        this.route = route;
        this.el = el;
        this.render = render;
        this.doc = doc;
        this.list = [];
        this.pos = 0;
        // region: properties
        /** 设置匹配模式 */
        this.mode = ReuseTabMatchMode.Menu;
        this._debug = false;
        this._allowClose = true;
        this._fixed = true;
        this._showCurrent = true;
        /** 切换时回调 */
        this.change = new EventEmitter();
        /** 关闭回调 */
        this.close = new EventEmitter();
        const route$ = this.router.events.pipe(filter(evt => evt instanceof NavigationEnd));
        this.sub$ = combineLatest(this.srv.change, route$).subscribe(([res, e]) => this.genList(res));
    }
    /** 是否Debug模式 */
    get debug() {
        return this._debug;
    }
    set debug(value) {
        this._debug = !!value;
    }
    /** 允许最多复用多少个页面 */
    get max() {
        return this._max;
    }
    set max(value) {
        this._max = Number(value);
    }
    /** 允许关闭 */
    get allowClose() {
        return this._allowClose;
    }
    set allowClose(value) {
        this._allowClose = !!value;
    }
    /** 是否固定 */
    get fixed() {
        return this._fixed;
    }
    set fixed(value) {
        this._fixed = !!value;
    }
    /** 总是显示当前页 */
    get showCurrent() {
        return this._showCurrent;
    }
    set showCurrent(value) {
        this._showCurrent = !!value;
    }
    genTit(title) {
        return title.text;
    }
    genList(notify) {
        const isClosed = notify && notify.active === 'close';
        const beforeClosePos = isClosed
            ? this.list.findIndex(w => w.url === notify.url)
            : -1;
        const ls = this.srv.items.map((item, index) => {
            return {
                url: item.url,
                title: this.genTit(item.title),
                closable: this.allowClose && item.closable && this.srv.count > 0,
                index,
                active: false,
                last: false,
            };
        });
        if (this.showCurrent) {
            const snapshot = this.route.snapshot;
            const url = this.srv.getUrl(snapshot);
            const idx = ls.findIndex(w => w.url === url);
            // jump directly when the current exists in the list
            // or create a new current item and jump
            if (idx !== -1 || (isClosed && notify.url === url)) {
                this.pos = isClosed
                    ? idx >= beforeClosePos
                        ? this.pos - 1
                        : this.pos
                    : idx;
            }
            else {
                const snapshotTrue = this.srv.getTruthRoute(snapshot);
                ls.push({
                    url,
                    title: this.genTit(this.srv.getTitle(url, snapshotTrue)),
                    closable: this.allowClose &&
                        this.srv.count > 0 &&
                        this.srv.getClosable(url, snapshotTrue),
                    index: ls.length,
                    active: false,
                    last: false,
                });
                this.pos = ls.length - 1;
            }
            // fix unabled close last item
            if (ls.length <= 1)
                ls[0].closable = false;
        }
        this.list = ls;
        if (ls.length && isClosed) {
            this.to(null, this.pos);
        }
        this.refStatus(false);
        this.visibility();
        this.cd.detectChanges();
    }
    visibility() {
        if (this.showCurrent)
            return;
        this.render.setStyle(this.el.nativeElement, 'display', this.list.length === 0 ? 'none' : 'block');
    }
    // region: UI
    cmChange(res) {
        switch (res.type) {
            case 'close':
                this._close(null, res.item.index, res.includeNonCloseable);
                break;
            case 'closeRight':
                this.srv.closeRight(res.item.url, res.includeNonCloseable);
                this.close.emit(null);
                break;
            case 'clear':
            case 'closeOther':
                this.srv.clear(res.includeNonCloseable);
                this.close.emit(null);
                break;
        }
    }
    refStatus(dc = true) {
        if (this.list.length) {
            this.list[this.list.length - 1].last = true;
            this.list.forEach((i, idx) => (i.active = this.pos === idx));
        }
        if (dc)
            this.cd.detectChanges();
    }
    to(e, index) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        index = Math.max(0, Math.min(index, this.list.length - 1));
        const item = this.list[index];
        this.router.navigateByUrl(item.url).then(res => {
            if (!res)
                return;
            this.pos = index;
            this.item = item;
            this.refStatus();
            this.change.emit(item);
        });
    }
    _close(e, idx, includeNonCloseable) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        const item = this.list[idx];
        this.srv.close(item.url, includeNonCloseable);
        this.close.emit(item);
        this.cd.detectChanges();
        return false;
    }
    // endregion
    ngOnInit() {
        this.setClass();
        this.genList();
    }
    setClass() {
        const body = this.doc.querySelector('body');
        const bodyCls = `has-ad-rt`;
        if (this.fixed) {
            this.render.addClass(body, bodyCls);
        }
        else {
            this.render.removeClass(body, bodyCls);
        }
    }
    ngOnChanges(changes) {
        if (changes.max)
            this.srv.max = this.max;
        if (changes.excludes)
            this.srv.excludes = this.excludes;
        if (changes.mode)
            this.srv.mode = this.mode;
        this.srv.debug = this.debug;
        this.setClass();
        this.cd.detectChanges();
    }
    ngOnDestroy() {
        this.sub$.unsubscribe();
    }
    selectedIndexChange(index) {
        const t = this;
        t.to(null, index);
    }
}
ReuseTabComponent.decorators = [
    { type: Component, args: [{
                selector: 'reuse-tab',
                template: `<mat-tab-group [selectedIndex]="pos" (selectedIndexChange)="selectedIndexChange($event)"><mat-tab *ngFor="let i of list; let index = index" [context-menu]="i"><ng-template mat-tab-label><span>{{i.title}}</span> <button mat-icon-button *ngIf="i.closable" class="tab_close" (click)="_close($event, index, false)"><mat-icon>close</mat-icon></button></ng-template></mat-tab></mat-tab-group><reuse-tab-context (change)="cmChange($event)"></reuse-tab-context>`,
                styles: [`:host ::ng-deep .mat-tab-label{cursor:default}.tab_close{margin-left:12px;cursor:pointer}.tab_close:hover{color:red}`],
                changeDetection: ChangeDetectionStrategy.OnPush,
                preserveWhitespaces: false,
                providers: [ReuseTabContextService],
            },] },
];
/** @nocollapse */
ReuseTabComponent.ctorParameters = () => [
    { type: ReuseTabService, },
    { type: ChangeDetectorRef, },
    { type: Router, },
    { type: ActivatedRoute, },
    { type: ElementRef, },
    { type: Renderer2, },
    { type: undefined, decorators: [{ type: Inject, args: [DOCUMENT,] },] },
];
ReuseTabComponent.propDecorators = {
    'mode': [{ type: Input },],
    'debug': [{ type: Input },],
    'max': [{ type: Input },],
    'excludes': [{ type: Input },],
    'allowClose': [{ type: Input },],
    'fixed': [{ type: Input },],
    'showCurrent': [{ type: Input },],
    'change': [{ type: Output },],
    'close': [{ type: Output },],
};
//# sourceMappingURL=reuse-tab.component.js.map