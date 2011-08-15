/*  ***********************************************
    *                                             *
    *       jDango Testbed                        *
    *       http://github.com/makiwara/jdango     * 
    *                                             *
    ********************************************* */
    
try { if (jQuery) ; } catch(e) { alert('Please kindly supply jQuery, it is required to use with jDango!'); } finally {
(function($){

	function trim(s) { return s.replace(/^\s+/, '').replace(/\s+$/, '')}
	function undef(s) { return s }

    $.testbed = {
        urlPrefix : 'tests/',
        urlPostfix : '.html',
        urlResult : '.result',
        
        fails : 0,
        
        add : function(position, input, result, match) {
            result = trim(result);
            input = trim(input);
            try { match = trim(match); } catch(e) { match = "NO MATCH PROVIDED" }
            var fail = result != match;
            if (fail) this.fails++;
            var html = [
            '<div class="b-test ',
            fail?"b-test-red b-test-expanded":"",
            '"><div class="hover"><div class="title">№&nbsp;', position, ' — ',
            fail?"problems":"ok!",
            '</div><table class="w100"><tr><td class="input"><textarea>',
            input.replace(/&/g, '&amp;').replace(/</g, '&lt;'),
            '</textarea></td><td class="result"><div class="b-test-result">',
            result,
            '</div></td></tr><tr><td class="source">HTML rendered from the template<textarea>',
            result.replace(/&/g, '&amp;').replace(/</g, '&lt;'),
            '</textarea></td><td class="match">HTML to test against<textarea>',
            match.replace(/&/g, '&amp;').replace(/</g, '&lt;'),
            '</textarea></td></tr></table></div></div>'
            ];
            $('.b-tests').prepend(html.join(""));
        },
        
        finalize: function(amount) {
            $('.b-info').html('Passed '+(amount-this.fails)+' of '+amount+' tests'+
            (this.fails>0?', <span class="error-red">&nbsp;'+this.fails+' problems&nbsp;</span>':''));
        },
        
        proceed_one : function(amount, position, ctx) {
            var that = this;
            position+=1;
	        if (position > amount) return this.finalize(amount);
		    $.get(that.urlPrefix+position+that.urlPostfix, function(template_input){ 
    	        var c = function(match_source){ 
    	            $.tpl.render(position+that.urlPostfix, ctx, function(template_result){
    	                $.testbed.add(position, template_input, template_result, match_source);
        		        that.proceed_one(amount, position, ctx);
    	        })}
    	        $.ajax({
                  url: that.urlPrefix+position+that.urlResult+that.urlPostfix,
                  success: c, error: c, dataType: "html"
                });
		    }, "html");
        },
        proceed : function(amount, ctx, start ) {
            $.testbed.fails = 0;
			$.tpl.init( { url:"tests/", libs:"libs/", lego:"blocks/" },
			            function(){ $.testbed.proceed_one(amount, start-1, ctx) });
        }
        
	};
})(jQuery); }