import { Component, State, h } from '@stencil/core';

// The page mounted by /guide/index.html. It only ever renders a guide - a
// listing of a folder's guides isn't something this route does at all; that
// gets embedded directly wherever it's needed (e.g. <guide-list> on
// /index.html), same as any other page-specific content. There's no
// reliable single URL to send "back" to for an arbitrary guide id, so this
// just retraces whatever page the visitor actually came from.
@Component({
  tag: 'guide-page',
  styleUrl: 'guide-page.css',
})
export class GuidePage {
  @State() id = '';

  componentWillLoad() {
    this.id = new URLSearchParams(window.location.search).get('id') || '';
  }

  private goBack() {
    history.go(-1);
  }

  render() {
    return (
      <app-layout>
        <section class="section">
          <div class="container">
            <p class="mb-4">
              <button type="button" class="back-button has-text-grey-light" onClick={() => this.goBack()}>
                &larr; Back
              </button>
            </p>
            {this.id ? (
              <guide-view guideId={this.id}></guide-view>
            ) : (
              <p class="has-text-grey-light">Guide not found.</p>
            )}
          </div>
        </section>
      </app-layout>
    );
  }
}
