export namespace forensic {
	
	export class Info {
	    found: boolean;
	    path: string;
	    version: string;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new Info(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.found = source["found"];
	        this.path = source["path"];
	        this.version = source["version"];
	        this.error = source["error"];
	    }
	}

}

export namespace main {
	
	export class AppInfo {
	    version: string;
	    goVersion: string;
	    os: string;
	    arch: string;
	    wailsVersion: string;
	
	    static createFrom(source: any = {}) {
	        return new AppInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.version = source["version"];
	        this.goVersion = source["goVersion"];
	        this.os = source["os"];
	        this.arch = source["arch"];
	        this.wailsVersion = source["wailsVersion"];
	    }
	}

}

