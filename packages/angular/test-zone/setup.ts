import 'zone.js';
import 'zone.js/testing';
import '@angular/compiler';
import { getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';

// zone.js patches the globals: these tests run in their own project, process per file.
getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
