(function($){
	function trim(s) { return s.replace(/^\s+/, '').replace(/\s+$/, '')}
	function undef(s) { return s }
	
	$.tpl = {
		templateQueryPrefix : 'SCRIPT#',
		templateUrlPrefix : '/static/jdango/templates/',
		javascriptControlStructures : true,
		precompilerSeparator : '\xA3', // '%#@!@#%',
		variableSeparator: '\xA2',
		variableSeparatorRe: /\xA2/g,
		variable : /\{\{\s*(\S+)\s*\}\}/g,
		blockStart : /block\s+([^ ]+)/,
		blockEnd : /endblock/,
		extendsRe : /extends\s+"([^""]+)"/,
		includeRe : /include\s+"([^""]+)"/,
		forStart : /for\s+([^ ]+)\s+in\s+([^ ]+)/,
		forEnd : /endfor/,
		init : function(params, callback)
		{
			if (params["cache"] != undef()) this.cache = params["cache"];
			if (params["url"] != undef()) this.templateUrlPrefix = params["url"];
			this.params = params;
			if (params["precompile"] != undef()) 
				this.precompile(params["precompile"], 0, callback);
			else
			 	callback(tpl);
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
			this.render(template, ctx, function(result){ $(target).html(result); if (callback) callback()});
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
			$(this.templateQueryPrefix+template).each(function(){ done=true; c(this.innerHTML); });
			if (!done) $.get(this.templateUrlPrefix+template, function(result){ c(result); });
		},
		compile_content : function(template, content, callback)
		{
			var parent = false;
			var c2 = content.replace(/(\{%)|(%})/g, this.precompileSeparator); 
			var c = c2.split(this.precompileSeparator);
			// 1. escape 0,2,4,... parts into strings, replacing variables by the way
			for (var i=0; i<c.length; i+=2)
			{
				// find replaces like {{item.index.key}} -> ctx["item"]["index"]["key"]
				var t = c[i].replace(this.variable, this.variableSeparator+'$1'+this.variableSeparator);
				t = t.split(this.variableSeparator);
				for (var j=1; j<t.length; j+=2)
				{
					t[j] = t[j].split(".").join(this.variableSeparator+"]["+this.variableSeparator);
					t[j] = this.variableSeparator+
								'+ctx['+this.variableSeparator+t[j]+this.variableSeparator+']+'+
						   this.variableSeparator;
				}
				c[i] = '_+="'+t.join("").replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(this.variableSeparatorRe, '"')
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
					// TODO add closures to precompile
					c[i] = '_+=tpl.cache["'+m[1]+'"](tpl, ctx)';
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
				var that=this;
				if (this.cache[parent] == undef()) 
				{
					this.compile(parent, function(error){
						if (error) callback(error);
						if (that.cache_eval[parent] == undef()) 
						{
							that.cache[template] = function(tpl,ctx){ return "{! inherited from closed source template !}" };
							return;
						}
						that.cache_eval[template] = that.cache_eval[parent];
						for (var i=0; i<blockCache.length; i++)
						{
							var bc = blockCache[i];
							var re = new RegExp("/\\*block "+bc[0]+"\\*/(.|\\n)*/\\*endblock "+bc[0]+"\\*/");
							that.cache_eval[template] = that.cache_eval[template].replace(re, c.splice(bc[1], bc[2]-bc[1]+1).join(' '));
						}
						that.cache[template] = eval(that.cache_eval[template]); // nb: this line is duplicated below
						callback();
					});
					return;
				}
			}
			else
				this.cache_eval[template] = 't = function(tpl, ctx){ var _=""; '+c.join(' ')+' return _; }';
			this.cache[template] = eval(this.cache_eval[template]); // nb: this line is duplicated above
			callback();
		},
		cache : {}, cache_eval : {}
	};
	
	this.test_cache = {
		'parent' : function(tpl, ctx){ 
				var _='';
				_+='<div><strong>';
				/*block title*/
				_+='Parent';
				/*endblock title*/
				_+=ctx['template_id'];
				_+='</strong></div>';
				return _;
			},
		'child' : function(tpl, data){
				var _='';
				_+='<div><strong>';
				/*block title*/
				_+='Child';
				/*endblock title*/
				_+=data['template_id'];
				_+='</strong></div>';
				return _;
			}
	}
})(jQuery);

/*
templates test cache was generated of:
<SCRIPT type="text/html" id="parent">
<div>
	<strong>{% block title %}Parent{% endblock %}: {{template_id}}</strong>
</div>
</SCRIPT>

<SCRIPT type="text/html" id="child" parent="parent">
{% block title %}Child{% endblock %}
</SCRIPT>
*/