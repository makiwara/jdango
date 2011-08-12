/*  *****************************************
    *                                       *
    *       Jdango v.0.3                    *
    *                                       *
    ***************************************** */


(function($){
    
    function alert(w) { console.log(w)}
    
    
	function trim(s) { return s.replace(/^\s+/, '').replace(/\s+$/, '')}
	function undef(s) { return s }
	
	$.tpl = {
		templateQueryPrefix : 'SCRIPT#',
		templateUrlPrefix : '/static/jdango/templates/',
		libraryUrlPrefix : '/static/jdango/libs/',
		javascriptControlStructures : true,
		precompileSeparator : '\xA3', // '%#@!@#%',
		variableSeparator: '\xA2',
		variableSeparatorRe: /\xA2/g,
		variable : /\{\{\s*(\S+?)\s*\}\}/g,
		blockStart : /block\s+([^ ]+)/,
		blockEnd : /endblock/,
		extendsRe : /extends\s+"([^""]+)"/,
		includeRe : /include\s+"([^""]+)"/,
        loadRe    : /load\s+"([^""]+)"/,
		forStart : /for\s+([^ ]+)\s+in\s+([^ ]+)/,
		forEnd : /endfor/,

		legoBlocksPrefix  : '/static/django/blocks/',
		legoBlocksRe      : /^b-([^_\/]*)(_([^_\/]*)_([^\/]*))?(\/.*)?$/,
		extendsAsteriskRe : /\{\{\*\}\}/g,
		
		templateStart : /template\s+([^ ]+)/,
		templateEnd : /endtemplate/,
		templateRe  : /\{\%\s*template\s+([^ ]+)\s*\%\}((.|\n)+?)\{\%\s*endtemplate\s*\%\}/,
		templatePathRe : /^(.*\.html).+$/,

		
		includeParamsRe  : /include\s+"([^"]+)"((\s+([a-zA-Z0-9_]+)\s*=(\s*([a-zA-Z0-9\.]+)|("[^"]*")|('[^']*')))+)/,
		includeParams1Re : /^\s+([a-zA-Z0-9_]+)\s*=(\s*([a-zA-Z0-9\.]+)|("[^"]*")|('[^']*'))/,
		
		init : function(params, callback)
		{
			if (params["cache"] != undef()) this.cache = params["cache"];
			if (params["url"]   != undef()) this.templateUrlPrefix = params["url"];
			if (params["lego"]  != undef()) this.legoBlocksPrefix = params["lego"];
			if (params["libs"]  != undef()) this.libraryUrlPrefix = params["libs"];
			this.params = params;
			if (params["precompile"] != undef()) 
				this.precompile(params["precompile"], 0, callback);
			else
			 	callback(this);
		},
		precompile : function(templates, index, callback)
		{
			var that = this;
			if (index >= templates.length) 
				return callback(that);
			else
				this.compile(templates[index], function(){ that.precompile(templates, index+1, callback) });
		},
		put : function(template, ctx, target, callback)
		{
			this.render(template, ctx, function(result){ $(target).html(result); if (callback) callback() });
		},
		render : function(template, ctx, callback)
		{
			var that = this;
			this.compile(template, function(error){
				if (error) alert("Error!: "+error);
				if (callback) callback(that.cache[template](that, ctx));
			});
		},
		compile : function(template, callback)
		{
			if (this.cache[template] != undef()) callback();
			var done = false;
			var that = this;
			var c = function(content) { that.compile_content(template, content, callback); }
			$(this.templateQueryPrefix+template).each(function(){ done=true; if (!done) c(this.innerHTML); });
			if (!done)
			{
			    var template = template.replace(that.templatePathRe, '$1');
    			var path = this.expand_path(template, this.templateUrlPrefix, ".html");
			    $.get(path, function(result){ c(result); }, "html");
			}
		},
		compile_content : function(template, content, callback)
		{
		    var that = this;
		    // first of all, remove all templates and push them in deps
		    var inner_templates = this.remove_templates(content);
		    content = inner_templates.content;
		    var compile_inner = function(templates)
		    {
		        if (templates.length == 0) 
		            compile_deps(dependancies);
		        else
    		        that.compile_content(template+"/"+templates[0]["name"], templates[0]["content"], function(error) {
        		        if (error) return callback(error);
        		        templates.shift();
        		        compile_inner(templates);
    		        })
		    }
		    var dependancies = [];
		    var scripts = [];
		    var compile_deps = function(deps)
		    {
		        if (deps.length == 0)
		            that._loadJs(scripts, callback);
		        else
    		        that.compile(deps[0], function(error) {
        		        if (error) return callback(error);
        		        deps.shift();
        		        compile_deps(deps);
    		        })
		    }
		    var add_deps = function(template) { dependancies[dependancies.length] = template }
		    var finalize = function()
		    {
				that.cache[template] = eval(that.cache_eval[template]); 
				compile_inner(inner_templates.templates);
		    }
			var parent = false;
			var c2 = content.replace(/(\{%)|(%})/g, this.precompileSeparator); 
			var c = c2.split(this.precompileSeparator);
			// 1. escape 0,2,4,... parts into strings, replacing variables by the way
			for (var i=0; i<c.length; i+=2)
			{
				// find replaces like {{item.index.key}} -> ctx["item"]["index"]["key"]
				var t = c[i].replace(this.extendsAsteriskRe, this.variableSeparator+this.variableSeparator)
                            .replace(this.variable, this.variableSeparator+'$1'+this.variableSeparator);
				t = t.split(this.variableSeparator);
				for (var j=1; j<t.length; j+=2)
				{
				    var replacement;
				    if (t[j] == "")
			            replacement = '__asterisk__';
				    else
				    {
			            replacement = 'ctx['+this.variableSeparator+t[j]+this.variableSeparator+']';
					    replacement = replacement.split(".").join(this.variableSeparator+"]["+this.variableSeparator);
					}
					t[j] = this.variableSeparator+ "+"+replacement+"+" +this.variableSeparator;
				}
				c[i] = '_+="'+t.join("").replace(/\\/g, "\\\\").replace(/"/g, "\\\"")
				        .replace(this.variableSeparatorRe, '"')
						.replace(/\n/g, "\\n").replace(/\t/g, "\\t").replace(/\r/g, "\\r")+'";';
			}
			// 2. detect blocks in 1,3,5,... parts
			var blockStack=[]; var blockStackSize=0;
			var blockCache=[];
			for (var i=1; i<c.length; i+=2)
			{
				var trimmed = trim(c[i]);
				var m;
				m = this.blockStart.exec(trimmed);
				if (m)
				{
					c[i] = '/*block '+m[1]+'*/';
					blockStack[blockStackSize++] = [m[1], i];
					continue;
				} 
				m = this.blockEnd.exec(trimmed);
				if (m)
				{
					c[i] = '/*endblock '+blockStack[--blockStackSize][0]+'*/';
					blockCache[blockCache.length] = [blockStack[blockStackSize][0], blockStack[blockStackSize][1], i];
					continue;
				} 
				m = this.forStart.exec(trimmed);
				if (m)
				{
					// TODO add correct subcontexts for cycles
					var unsep = m[2].split(".").join('"]["');
					c[i] = '/*for */ for (var _foriterator in ctx["'+unsep+'"]) { ctx["'+m[1]+'"] = ctx["'+unsep+'"][_foriterator]; ';
					continue;
				} 
				m = this.forEnd.exec(trimmed);
				if (m)
				{
					c[i] = '/*endfor */ } ';
					continue;
				} 
				m = this.extendsRe.exec(trimmed);
				if (m)
				{
					parent = m[1];
					continue;
				} 
				m = this.includeRe.exec(trimmed);
				if (m)
				{
			        this._loadCss([this.expand_path(m[1], this.legoBlocksPrefix, ".css")])
				    var include_template = m[1];
				    add_deps(include_template);
				    // todo parse params
				    var params_m = this.includeParamsRe.exec(trimmed);
				    var ctx;
				    if (params_m)
				    {
				        var keys = {};
				        var values = {};
				        var params = params_m[2];
				        while (true)
				        {
				            var params_m1 = this.includeParams1Re.exec(params);
				            if (params_m1)
				            {
				                params = params.substr(params_m1[0].length);
				                if (params_m1[3])
				                    keys['"'+params_m1[1]+'"'] = '"'+params_m1[2]+'"';
				                else
			                        values['"'+params_m1[1]+'"'] = params_m1[2];
				            } 
				            else break;
				        }
				        var joined_keys = [];
				        for (var x in keys) joined_keys[joined_keys.length] = x+":"+keys[x];
				        var joined_values = [];
				        for (var x in values) joined_values[joined_values.length] = x+":"+values[x];
				        ctx = 'tpl.CTX(ctx, { keys: {'+joined_keys+'}, values:{'+joined_values+'}})';
				    }
				    else
				        ctx = 'ctx';
					c[i] = '_+=tpl.cache["'+include_template+'"](tpl, '+ctx+');';
					continue;
				} 
                m = this.loadRe.exec(trimmed);
                if (m)
                {
                    scripts[scripts.length] = this.expand_path(m[1], this.libraryUrlPrefix, ".js");
                    c[i] = "";
                    continue;
                } 
				// for not implemented tags - assume it javascript or mark as missed match
				if (!this.javascriptControlStructures)
					c[i] = '/* {% '+c[i]+' %} */ _+="{! '+c[i].replace(/\\/g, "\\\\").replace(/"/g, "\\\"")+' !}";';
			}
			// 3. glue up in function
			if (parent === false) parent = $(this.templateQueryPrefix+template).attr('parent');
			if (parent)
			{
				if (this.cache[parent] == undef()) 
				{
			        this._loadCss([this.expand_path(parent, this.legoBlocksPrefix, ".css")])
					this.compile(parent, function(error){
						if (error) return callback(error);
						if (that.cache_eval[parent] == undef()) 
						{
							that.cache[template] = function(tpl,ctx){ return "{! inherited from closed source template !}" };
							return;
						}
						that.cache_eval[template] = that.cache_eval[parent];
						that.cache_eval[template] = that.cache_eval[template].replace(
						        /\/\*asterisk\*\/(.*?)\/\*endasterisk\*\//, 
						        '/*asterisk*/var __asterisk__="'+template+'";/*endasterisk*/');
						for (var i=0; i<blockCache.length; i++)
						{
							var bc = blockCache[i];
							var re = new RegExp("/\\*block "+bc[0]+"\\*/(.|\\n)*/\\*endblock "+bc[0]+"\\*/");
							that.cache_eval[template] = that.cache_eval[template].replace(re, c.splice(bc[1], bc[2]-bc[1]+1).join(' '));
						}
						finalize();
					});
					return;
				}
			}
			else
				this.cache_eval[template] = 't = function(tpl, ctx){ /*asterisk*/var __asterisk__="'+template+'";/*endasterisk*/ var _=""; '+c.join(' ')+' return _; }';
			finalize();
		},
		cache : {}, cache_eval : {},
		
        _css : {},
		_loadCss : function( urls )
        {
            for (var i=0; i<urls.length; i++)
                if (!this._css[urls[i]] && urls[i])
                    {
                        this._css[urls[i]] = true;
                        var newSS=document.createElement('link');
                        newSS.rel='stylesheet';
                        newSS.href=urls[i];
                        document.getElementsByTagName("head")[0].appendChild(newSS);
                    }
        },
        scripts : {},
        _loadJs : function( scripts, callback )
        {
            var i=0;
            var that = this;
            var next = function(callback_queue_url)
            {
                if (callback_queue_url != undef() && that.scripts[callback_queue_url] != "loaded")
                {
                    for (var j=0; j<that.scripts[callback_queue_url].length; j++)
                        that.scripts[callback_queue_url][j]()
                    that.scripts[callback_queue_url] = "loaded";
                }
                if (i>= scripts.length) 
                {
                    if (callback != undef()) callback();
                    return;
                }
                var s = scripts[i]; i++;
                if (that.scripts[s] == undef() && s != false)
                {
                    that.scripts[s] = [];
                    $.getScript(s, (function(s) {
                        return function() {
                            next(s);
                        }
                    })(s));
                }
                else 
                {
                    if (that.scripts[s] === "loaded") 
                        next();
                    else
                        that.scripts[s].push(next);
                }
            }
            next();
        },
        
        expand_path : function( path, default_prefix, default_postfix )
        {// this function expands "b-XXX" and "b-XXX/YYY.html" into full path
            // "b-XXX", ".html" -> "lego/b-XXX/b-XXX"
            // "b-YYY/YYY.js" -> "lego/b-YYY/YYY.js"
            // "some.html" -> "templates/some.html"
	        var lego_m = this.legoBlocksRe.exec(path);
	        var result = path;
	        if (lego_m)
		    {
		        var result = this.legoBlocksPrefix + path;
		        if (!lego_m[5]) 
		            result += "/" + path + default_postfix;
	            return result;
	        }
	        if (default_postfix == ".css") return false;
	        else return default_prefix + path;
        },
        
        remove_templates : function( content )
        {
            var templates = [];
            while (true)
            {
                var m = this.templateRe.exec(content);
                if (!m) break;
                templates[ templates.length] = { name:m[1], content:m[2] };
                content = content.substr(this.templateRe.lastIndex+m[0].length);
            }
            return { content: content, templates: templates };
        },
        
        CTX : function( ctx, kv )
        {// this function enhances ctx with kv{keys, values}, where keys means =ctx[keys[k]] 
            var ctx2 = {};
            for (var k in ctx)
                ctx2[k] = ctx[k];
            for (var k in kv["keys"])
            {
                var tt = 't=ctx["'+kv["keys"][k].split(".").join('"]["')+'"]';
                var tt = eval(tt);
                ctx2[k] = t;
            }
            for (var k in kv["values"])
                ctx2[k] = kv["values"][k];
            return ctx2;
        }
        
	};
	
})(jQuery);