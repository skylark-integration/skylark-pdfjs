define([
	"skylark-langx/skylark",
	"./pdf"
],function(skylark,pdfjs) {
	return skylark.attach("intg.pdfjs",pdfjs);
})