/*  ***********************************************
    *                                             *
    *       jDango v.0.4                          *
    *       http://github.com/makiwara/jdango     * 
    *                                             *
    ********************************************* */
    
try { if (jQuery) ; } catch(e) { alert('Please kindly supply jQuery, it is required to use with jDango!'); } finally {
(function($){

    /** @private strip whitespace from both ends of string */
	function trim(s) { return s.replace(/^\s+/, '').replace(/\s+$/, '')}
    /** @private 100 per cent proof ‘undefined’ value */
	function undef(s) { return s }
	
	/** @namespace jDango template engine singleton */
	$.tpl = {
	    /** @private template cache prefix for <script>-based templates */
		templateQueryPrefix : 'SCRIPT#',

	    /** @private url prefix for HTML templates */
		templateUrlPrefix : '/static/jdango/templates/',
		
	    /** @private url prefix for JS libraries loaded via {% load "smth" %} */
		libraryUrlPrefix : '/static/jdango/libs/',

	    /** @public is voluntary javascript allowed inside of {%...%} tags?  */
		javascriptControlStructures : true,

	    /** @private separator which is used to split template in parts of HTML and control structures */
		precompileSeparator : '\xA3', // '%#@!@#%',

	    /** @private R.E. for detecting variable substitution   */
		variable : /\{\{\s*(\S+?)\s*\}\}/g,
	    /** @private separator helper for process of chunking variables like "styleguide.colors.text" */
		variableSeparator: '\xA2',
	    /** @private R.E. for separator helper for process of chunking variables like "styleguide.colors.text" */
		variableSeparatorRe: /\xA2/g,

	    /** @private R.E. for {% block BLOCKNAME %} construction */
		blockStart : /block\s+([^ ]+)/,
	    /** @private R.E. for {% endblock %} construction */
		blockEnd : /endblock/,
	    /** @private R.E. for {% extends "templatename" %} construction */
		extendsRe : /extends\s+"([^""]+)"/,
	    /** @private R.E. for {% include "templatename" %} construction */
		includeRe : /include\s+"([^""]+)"/,
	    /** @private R.E. for {% load "libraryname" %} construction */
        loadRe    : /load\s+"([^""]+)"/,
	    /** @private R.E. for {% for X in Y %} loop start */
		forStart : /for\s+([^ ]+)\s+in\s+([^ ]+)/,
	    /** @private R.E. for {% endfor %} loop end */
		forEnd : /endfor/,

	    /** @private url prefix for (Lego-)BEM-style blocks */
		legoBlocksPrefix  : '/static/django/blocks/',
	    /** @private R.E. to detect BEM-blocks in templatename provided for include/extends */
		legoBlocksRe      : /^b-([^_\/]*)(_([^_\/]*)_([^\/]*))?(\/.*)?$/,
	    /** @private R.E. for {{*}} operator */
		extendsAsteriskRe : /\{\{\*\}\}/g,
		
	    /** @private R.E. for {% template templatename %} */
		templateStart : /template\s+([^ ]+)/,
	    /** @private R.E. for {% endtemplate %} */
		templateEnd : /endtemplate/,
	    /** @private R.E. for inner template detection (and removal) */
		templateRe  : /\{\%\s*template\s+([^ ]+)\s*\%\}((.|\n)+?)\{\%\s*endtemplate\s*\%\}/,
	    /** @private R.E. for inner template detection in templatename provided for include/extends */
		templatePathRe : /^(.*\.html).+$/,

	    /** @private R.E. for include parameters detection */
		includeParamsRe  : /include\s+"([^"]+)"((\s+([a-zA-Z0-9_]+)\s*=(\s*([a-zA-Z0-9\.]+)|("[^"]*")|('[^']*')))+)/,
	    /** @private R.E. for detection of a name/value pair for include parameters */
		includeParams1Re : /^\s+([a-zA-Z0-9_]+)\s*=(\s*([a-zA-Z0-9\.]+)|("[^"]*")|('[^']*'))/,

	    /** @private R.E. for stripping django-style {#..#} comments */
		commentsDjangoRe : /\{\#(.|\n)*?\#\}/g,
	    /** @private R.E. for stripping HTML-style <!--..--> comments and whitespace around them */
		commentsHtmlRe   : /\s*\<\!\-\-(.|\n)*?\-\-\>(\s?)\s*/g,
		
	    /** 
	     * Initializes template engine with given parameters. 
	     * 
	     * @param {hash} params Parameters specifying urls: url, lego, libs; precompiled cache: cache; a list of templates to precompile: precompile
	     * @param {function(tpl)} callback Callback function to call on precompilation completion
	     */
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

	    /** 
	     * Precompiles templates into some javascript code and stores that code in cache.
	     * Usually you have no need to call this method directly.
	     * 
	     * @private
	     * @param {string[]} templates Names of templates to precompile.
	     * @param {number} index Number of current template in `templates` queue
	     * @param {function(tpl)} callback Callback function to call on precompilation completion
	     */
		precompile : function(templates, index, callback)
		{
			var that = this;
			if (index >= templates.length) 
				return callback(that);
			else
				this.compile(templates[index], function(){ that.precompile(templates, index+1, callback) });
		},

	    /** 
	     * Renders a template with given variable context and puts the result into jQuery target.
	     * Template is loaded and compiled if necessary.
	     * 
	     * @param {string} template Name of a template to render
	     * @param {hash} ctx Variable context to use with {{var}} substitutions
	     * @param {string} target String with jQuery-style coordinates of the DOM target, HTML in `$(target)` will be replaced with the result of template render
	     * @param {function(tpl)} callback Callback function to call on completion of the render
	     */
		put : function(template, ctx, target, callback)
		{
			this.render(template, ctx, function(result){ $(target).html(result); if (callback) callback() });
		},

	    /** 
	     * Renders a template with given variable context and calls the callback function with render result.
	     * Template is loaded and compiled if necessary.
	     * 
	     * @param {string} template Name of a template to render
	     * @param {hash} ctx Variable context to use with {{var}} substitutions
	     * @param {function(html)} callback Callback function to call on completion of the render. The result of the render is transferred as the first parameter of function call.
	     */
		render : function(template, ctx, callback)
		{
			var that = this;
			this.compile(template, function(error){
				if (error) alert("Error!: "+error);
				if (callback) callback(that.cache[template](that, ctx));
			});
		},

	    /** 
	     * Loads and compiles given template into some JavaScript code and stores that code in template cache.
	     * Usually you have no need to call this method directly.
	     * NB: This method is client-side only because of use of unabstracted `$.get(...)` to load a template.
	     * 
	     * @private
	     * @param {string} template Name of a template to render
	     * @param {function(tpl)} callback Callback function to call on completion of the compilation
	     */
		compile : function(template, callback)
		{
		    /** Template is already compiled, there is nothing to do */
			if (this.cache[template] != undef()) return callback();
			/** Proceed with compilation */
			var done = false;
			var that = this;
			/** Prepare function snippet to do actual compilation of a content */
			var c = function(content) { that.compile_content(template, content, callback); }
			/** Try to compile <script>-embedded template */
			$(this.templateQueryPrefix+template).each(function(){ done=true; if (!done) c(this.innerHTML); });
			/** Try to load template from path (expanding it if needed) */
			if (!done)
			{
			    var template = template.replace(that.templatePathRe, '$1');
    			var path = this.expand_path(template, this.templateUrlPrefix, ".html");
			    $.get(path, function(result){ c(result); }, "html");
			}
		},

	    /** 
	     * Compiles content of the given templates into some JavaScript code and store the result in template cache.
	     * Usually you have no need to call this method directly.
	     * 
	     * @private
	     * @param {string} template Name of a template to render
	     * @param {string} content Raw content of given template
	     * @param {function(tpl)} callback Callback function to call on completion of the compilation
	     */
		compile_content : function(template, content, callback)
		{
		    /** Here lies DRAGONS */
		    var that = this;
		    // remove comments
		    content = content.replace(that.commentsDjangoRe, "").replace(that.commentsHtmlRe, "$2");
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
		            that.loadJs(scripts, callback);
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
			        this.loadCss([this.expand_path(m[1], this.legoBlocksPrefix, ".css")])
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
			        this.loadCss([this.expand_path(parent, this.legoBlocksPrefix, ".css")])
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
			else
				this.cache_eval[template] = 't = function(tpl, ctx){ /*asterisk*/var __asterisk__="'+template+'";/*endasterisk*/ var _=""; '+c.join(' ')+' return _; }';
			finalize();
		},

	    /** @private template cache compiled into JavaScript */
		cache : {}, 
	    /** @private source version of template cache before JavaScript compilation */
		cache_eval : {},
		
	    /** @private hash of CSS files already loaded by `.loadCss()` */
        css : {},
	    /** 
	     * Loads CSS files into DOM and stores paths to avoid reoccuring load.
	     * Usually you have no need to call this method directly.
	     * NB: This method is client-side only!
	     * 
	     * @private
	     * @param {string[]} urls List of paths to CSS files to append them into DOM.
	     */
		loadCss : function( urls )
        {
            for (var i=0; i<urls.length; i++)
                if (!this.css[urls[i]] && urls[i])
                    {
                        this.css[urls[i]] = true;
                        var newSS=document.createElement('link');
                        newSS.rel='stylesheet';
                        newSS.href=urls[i];
                        document.getElementsByTagName("head")[0].appendChild(newSS);
                    }
        },
	    /** @private hash of JS files already loaded by `.loadJs()` */
        scripts : {},
	    /** 
	     * Loads and runs JS files; stores paths to avoid reoccuring load.
	     * Usually you have no need to call this method directly.
	     * NB: This method is client-side only though it uses unabstracted `$.getScript` to get and run script contents!
	     * 
	     * @private
	     * @param {string[]} scripts List of paths to JS files to load an run
	     * @param {function()} callback Callback function to call on load completion
	     */
        loadJs : function( scripts, callback )
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
        
	    /** 
	     * Expands paths used in include/extends template tags:
         * "b-XXX" -> "lego/b-XXX/b-XXX" (with different postfixes provided)
         * "b-YYY/YYY.js" -> "lego/b-YYY/YYY.js"
         * "some.html" -> "templates/some.html"
	     * Usually you have no need to call this method directly.
	     * 
	     * @private
	     * @param {string} path Path to expand
	     * @param {string} default_prefix Default prefix for the case of no substitution required (usually `templates`)
	     * @param {string} default_postfix Default postfix for the case of standard BEM substitution (`html`, `js` or `css`)
	     * @returns {string} Expanded version of path
	     */
        expand_path : function( path, default_prefix, default_postfix )
        {
	        var lego_m = this.legoBlocksRe.exec(path);
	        var result = path;
	        if (lego_m)
		    {
		        var result = this.legoBlocksPrefix + path;
		        if (!lego_m[5]) 
		            result += "/" + path + default_postfix;
		        else
    	            if (default_postfix == ".css") return false;
	            return result;
	        }
	        if (default_postfix == ".css") return false;
	        else return default_prefix + path;
        },
        
	    /** 
	     * Detects, extracts and removes inner templates from given template content.
	     * Usually you have no need to call this method directly.
         *
	     * For example, content is:
	     *     Hello 
	     *     {% template first %} WOW {% endtemplate %}
	     *     people
	     *     {% template second %} OMG {% endtemplate %}
	     * Result is (omitting whitespaces):
	     *     { content: "Hello people", templates: { first: "WOW", second: "OMG" } }
	     * 
	     * @private
	     * @param {string} content Template content with templates inside.
	     * @param {string} default_prefix Default prefix for the case of no substitution required (usually `templates`)
	     * @param {string} default_postfix Default postfix for the case of standard BEM substitution (`html`, `js` or `css`)
	     * @returns {hash} Hash with `templates` removed from `content` 
	     */
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
        
	    /** 
	     * Enhances variable context with key-value pairs.
	     * This method does nothing with original context, it creates a copy on shallow level.
	     * This method is called in time of template rendering and used to provide additional parameters while including a template.
	     * Usually you have no need to call this method directly even from the inside of a template.
	     *
	     * @example
	     * var ctx = { title: "Hello, people", color: "#000" };
	     * var res = $.tpl.CTX(ctx, { color:"red", font:"Arial" })
	     * >> console.log(res);
	     * >> { title: "Hello, people", color: "red", font:"Arial" }
	     * >> console.log(ctx);
	     * >> { title: "Hello, people", color: "#000" }
	     * 
	     * @private
	     * @param {hash} ctx Variable context to enhance
	     * @param {hash} kv Hash of variable to enhance with
	     * @returns {hash} Enhanced shallow copy of given context
	     */
        CTX : function( ctx, kv )
        {
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
        
        /** Here is the end of the world */
	};
})(jQuery); }