/*!
 * Live edit preview.
 */
( function () {

	/**
	 * @ignore
	 * @param {jQuery.Event} e
	 */
	function doLivePreview( e ) {
		var isDiff, api, parseRequest, diffRequest, postData, copySelectors, section, summary,
			$wikiPreview, $wikiDiff, $editform, $textbox, $copyElements, $spinner, $errorBox;

		isDiff = ( e.target.name === 'wpDiff' );
		$wikiPreview = $( '#wikiPreview' );
		$wikiDiff = $( '#wikiDiff' );
		$editform = $( '#editform' );
		$textbox = $editform.find( '#wpTextbox1' );

		summary = OO.ui.infuse( $( '#wpSummaryWidget' ) );

		$spinner = $( '.mw-spinner-preview' );
		$errorBox = $( '.errorbox' );
		section = $editform.find( '[name="wpSection"]' ).val();

		if ( $textbox.length === 0 ) {
			return;
		}
		// Show changes for a new section is not yet supported
		if ( isDiff && section === 'new' ) {
			return;
		}
		e.preventDefault();

		// Remove any previously displayed errors
		$errorBox.remove();
		// Show #wikiPreview if it's hidden to be able to scroll to it
		// (if it is hidden, it's also empty, so nothing changes in the rendering)
		$wikiPreview.show();

		// Jump to where the preview will appear
		$wikiPreview[ 0 ].scrollIntoView();

		copySelectors = [
			// Main
			'.mw-indicators',
			'#firstHeading',
			'#wikiPreview',
			'#wikiDiff',
			'#catlinks',
			'#p-lang',
			// Editing-related
			'.templatesUsed',
			'.limitreport',
			'.mw-summary-preview'
		];
		$copyElements = $( copySelectors.join( ',' ) );

		// Not shown during normal preview, to be removed if present
		$( '.mw-newarticletext' ).remove();

		if ( $spinner.length === 0 ) {
			$spinner = $.createSpinner( {
				size: 'large',
				type: 'block'
			} )
				.addClass( 'mw-spinner-preview' )
				.css( 'margin-top', '1em' );
			$wikiPreview.before( $spinner );
		} else {
			$spinner.show();
		}

		$copyElements.addClass( [ 'mw-preview-copyelements', 'mw-preview-copyelements-loading' ] );

		api = new mw.Api();
		postData = {
			formatversion: 2,
			action: 'parse',
			title: mw.config.get( 'wgPageName' ),
			summary: summary.getValue(),
			prop: ''
		};

		if ( isDiff ) {
			$wikiPreview.hide();

			if ( postData.summary ) {
				parseRequest = api.post( postData );
			}

			diffRequest = api.post( {
				formatversion: 2,
				action: 'query',
				prop: 'revisions',
				titles: mw.config.get( 'wgPageName' ),
				rvdifftotext: $textbox.textSelection( 'getContents' ),
				rvdifftotextpst: true,
				rvprop: '',
				rvsection: section === '' ? undefined : section,
				uselang: mw.config.get( 'wgUserLanguage' )
			} );

			// Wait for the summary before showing the diff so the page doesn't jump twice
			$.when( diffRequest, parseRequest ).done( function ( response ) {
				var diffHtml;
				try {
					diffHtml = response[ 0 ].query.pages[ 0 ]
						.revisions[ 0 ].diff.body;
					$wikiDiff.find( 'table.diff tbody' ).html( diffHtml );
					mw.hook( 'wikipage.diff' ).fire( $wikiDiff.find( 'table.diff' ) );
				} catch ( err ) {
					// "result.blah is undefined" error, ignore
					mw.log.warn( err );
				}
				$wikiDiff.show();
			} );
		} else {
			$wikiDiff.hide();

			$.extend( postData, {
				prop: 'text|indicators|displaytitle|modules|jsconfigvars|categorieshtml|templates|langlinks|limitreporthtml',
				text: $textbox.textSelection( 'getContents' ),
				pst: true,
				preview: true,
				sectionpreview: section !== '',
				disableeditsection: true,
				useskin: mw.config.get( 'skin' ),
				uselang: mw.config.get( 'wgUserLanguage' )
			} );
			if ( section === 'new' ) {
				postData.section = 'new';
				postData.sectiontitle = postData.summary;
			}

			parseRequest = api.post( postData );
			parseRequest.done( function ( response ) {
				var newList, $displaytitle, $content, $parent, $list;
				if ( response.parse.jsconfigvars ) {
					mw.config.set( response.parse.jsconfigvars );
				}
				if ( response.parse.modules ) {
					mw.loader.load( response.parse.modules.concat(
						response.parse.modulestyles
					) );
				}

				newList = [];
				// eslint-disable-next-line no-jquery/no-each-util
				$.each( response.parse.indicators, function ( name, indicator ) {
					newList.push(
						$( '<div>' )
							.addClass( 'mw-indicator' )
							.attr( 'id', mw.util.escapeIdForAttribute( 'mw-indicator-' + name ) )
							.html( indicator )
							.get( 0 ),
						// Add a whitespace between the <div>s because
						// they get displayed with display: inline-block
						document.createTextNode( '\n' )
					);
				} );
				$( '.mw-indicators' ).empty().append( newList );

				if ( response.parse.displaytitle ) {
					$displaytitle = $( $.parseHTML( response.parse.displaytitle ) );
					// The following messages can be used here:
					// * editconflict
					// * editingcomment
					// * editingsection
					// * editing
					// * creating
					$( '#firstHeading' ).msg(
						mw.config.get( 'wgEditMessage', 'editing' ),
						$displaytitle
					);
					document.title = mw.msg(
						'pagetitle',
						// The following messages can be used here:
						// * editconflict
						// * editingcomment
						// * editingsection
						// * editing
						// * creating
						mw.msg(
							mw.config.get( 'wgEditMessage', 'editing' ),
							$displaytitle.text()
						)
					);
				}
				if ( response.parse.categorieshtml ) {
					$content = $( $.parseHTML( response.parse.categorieshtml ) );
					mw.hook( 'wikipage.categories' ).fire( $content );
					$( '.catlinks[data-mw="interface"]' ).replaceWith( $content );
				}
				if ( response.parse.templates ) {
					newList = response.parse.templates.map( function ( template ) {
						return $( '<li>' )
							.append( $( '<a>' )
								.attr( {
									href: mw.util.getUrl( template.title ),
									class: ( template.exists ? '' : 'new' )
								} )
								.text( template.title )
							);
					} );

					$editform.find( '.templatesUsed .mw-editfooter-list' ).detach().empty().append( newList ).appendTo( '.templatesUsed' );
				}
				if ( response.parse.limitreporthtml ) {
					$( '.limitreport' ).html( response.parse.limitreporthtml );
				}
				if ( response.parse.langlinks && mw.config.get( 'skin' ) === 'vector' ) {
					newList = response.parse.langlinks.map( function ( langlink ) {
						var bcp47 = mw.language.bcp47( langlink.lang );
						// eslint-disable-next-line mediawiki/class-doc
						return $( '<li>' )
							.addClass( 'interlanguage-link interwiki-' + langlink.lang )
							.append( $( '<a>' )
								.attr( {
									href: langlink.url,
									title: langlink.title + ' - ' + langlink.langname,
									lang: bcp47,
									hreflang: bcp47
								} )
								.text( langlink.autonym )
							);
					} );
					$list = $( '#p-lang ul' );
					$parent = $list.parent();
					$list.detach().empty().append( newList ).prependTo( $parent );
				}

				if ( response.parse.text ) {
					$content = $wikiPreview.children( '.mw-content-ltr,.mw-content-rtl' );
					$content
						.detach()
						.html( response.parse.text );

					mw.hook( 'wikipage.content' ).fire( $content );

					// Reattach
					$wikiPreview.append( $content );

					$wikiPreview.show();
				}
			} );
		}
		$.when( parseRequest, diffRequest ).done( function ( parseResp ) {
			var parse = parseResp && parseResp[ 0 ].parse,
				isSubject = ( section === 'new' ),
				$summaryPreview = $editform.find( '.mw-summary-preview' ).empty();
			if ( parse && parse.parsedsummary ) {
				$summaryPreview.append(
					mw.message( isSubject ? 'subject-preview' : 'summary-preview' ).parse(),
					' ',
					$( '<span>' ).addClass( 'comment' ).html(
						// There is no equivalent to rawParams
						mw.message( 'parentheses' ).escaped()
							// .replace() use $ as start of a pattern.
							// $$ is the pattern for '$'.
							// The inner .replace() duplicates any $ and
							// the outer .replace() simplifies the $$.
							.replace( '$1', parse.parsedsummary.replace( /\$/g, '$$$$' ) )
					)
				);
			}
			mw.hook( 'wikipage.editform' ).fire( $editform );
		} ).always( function () {
			$spinner.hide();
			$copyElements.removeClass( 'mw-preview-copyelements-loading' );
		} ).fail( function ( code, result ) {
			// This just shows the error for whatever request failed first
			var $errorMsg = api.getErrorMessage( result );
			$errorBox = $( '<div>' )
				.addClass( 'errorbox' )
				.append( $( '<strong>' ).text( mw.message( 'previewerrortext' ).text() ) )
				.append( $errorMsg );
			$wikiDiff.hide();
			$wikiPreview.hide().before( $errorBox );
		} );
	}

	$( function () {
		// Do not enable on user .js/.css pages, as there's no sane way of "previewing"
		// the scripts or styles without reloading the page.
		if ( $( '#mw-userjsyoucanpreview' ).length || $( '#mw-usercssyoucanpreview' ).length ) {
			return;
		}

		// The following elements can change in a preview but are not output
		// by the server when they're empty until the preview response.
		// TODO: Make the server output these always (in a hidden state), so we don't
		// have to fish and (hopefully) put them in the right place (since skins
		// can change where they are output).

		if ( !document.getElementById( 'p-lang' ) && document.getElementById( 'p-tb' ) && mw.config.get( 'skin' ) === 'vector' ) {
			$( '.portal' ).last().after(
				$( '<div>' ).attr( {
					class: 'portal',
					id: 'p-lang',
					role: 'navigation',
					'aria-labelledby': 'p-lang-label'
				} )
					.append( $( '<h3>' ).attr( 'id', 'p-lang-label' ).text( mw.msg( 'otherlanguages' ) ) )
					.append( $( '<div>' ).addClass( 'body' ).append( '<ul>' ) )
			);
		}

		if ( !$( '.mw-summary-preview' ).length ) {
			$( '#wpSummaryWidget' ).after(
				$( '<div>' ).addClass( 'mw-summary-preview' )
			);
		}

		if ( !document.getElementById( 'wikiDiff' ) && document.getElementById( 'wikiPreview' ) ) {
			$( '#wikiPreview' ).after(
				$( '<div>' )
					.hide()
					.attr( 'id', 'wikiDiff' )
					.append(
						$( '<table>' ).addClass( 'diff' ).append(
							$( '<col>' ).addClass( 'diff-marker' ),
							$( '<col>' ).addClass( 'diff-content' ),
							$( '<col>' ).addClass( 'diff-marker' ),
							$( '<col>' ).addClass( 'diff-content' ),
							$( '<tbody>' )
						)
					)
			);
		}

		// This should be moved down to '#editform', but is kept on the body for now
		// because the LiquidThreads extension is re-using this module with only half
		// the EditPage (doesn't include #editform presumably, T57463).
		$( document.body ).on( 'click', '#wpPreview, #wpDiff', doLivePreview );
	} );

}() );
